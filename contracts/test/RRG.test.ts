import { expect } from 'chai';
import { ethers } from 'hardhat';
import { time } from '@nomicfoundation/hardhat-network-helpers';
import { RRG } from '../../typechain-types';
import { HardhatEthersSigner } from '@nomicfoundation/hardhat-ethers/signers';

// ── Minimal ERC-20 with permit (mock USDC) ───────────────────────────
const MOCK_USDC_ABI = [
  'constructor()',
  'function mint(address to, uint256 amount) external',
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address) external view returns (uint256)',
  'function transfer(address, uint256) external returns (bool)',
  'function transferFrom(address, address, uint256) external returns (bool)',
  'function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external',
  'function nonces(address owner) external view returns (uint256)',
  'function DOMAIN_SEPARATOR() external view returns (bytes32)',
  'function name() external view returns (string)',
];

const MOCK_USDC_BYTECODE = `
// Simple ERC20Permit mock — compile separately or use OZ test helpers
`;

describe('RRG', () => {
  let rrg: RRG;
  let owner: HardhatEthersSigner;
  let platform: HardhatEthersSigner;
  let creator: HardhatEthersSigner;
  let buyer: HardhatEthersSigner;
  let mockUsdcAddress: string;

  const PRICE_6DP   = 10_000_000n; // 10 USDC
  const MAX_SUPPLY  = 5;
  const TOKEN_ID    = 1;

  beforeEach(async () => {
    [owner, platform, creator, buyer] = await ethers.getSigners();

    // Deploy mock ERC20Permit (use OZ MockERC20 or deploy a local one)
    const MockToken = await ethers.getContractFactory('MockUSDC');
    const mockUsdc  = await MockToken.deploy();
    mockUsdcAddress = await mockUsdc.getAddress();

    // Mint USDC to buyer
    await mockUsdc.mint(buyer.address, PRICE_6DP * 10n);

    // Deploy RRG
    const RRGFactory = await ethers.getContractFactory('RRG');
    rrg = await RRGFactory.deploy(
      mockUsdcAddress,
      platform.address,
      'https://realrealgenuine.com/api/rrg/drops/'
    );
  });

  describe('registerDrop', () => {
    it('registers a drop correctly', async () => {
      await rrg.registerDrop(TOKEN_ID, creator.address, PRICE_6DP, MAX_SUPPLY);
      const drop = await rrg.getDrop(TOKEN_ID);
      expect(drop.creator).to.equal(creator.address);
      expect(drop.priceUsdc).to.equal(PRICE_6DP);
      expect(drop.maxSupply).to.equal(MAX_SUPPLY);
      expect(drop.minted).to.equal(0);
      expect(drop.active).to.be.true;
    });

    it('reverts if tokenId already registered', async () => {
      await rrg.registerDrop(TOKEN_ID, creator.address, PRICE_6DP, MAX_SUPPLY);
      await expect(
        rrg.registerDrop(TOKEN_ID, creator.address, PRICE_6DP, MAX_SUPPLY)
      ).to.be.revertedWith('RRG: tokenId already registered');
    });

    it('reverts if maxSupply > 50', async () => {
      await expect(
        rrg.registerDrop(TOKEN_ID, creator.address, PRICE_6DP, 51)
      ).to.be.revertedWith('RRG: edition size must be 1-50');
    });

    it('reverts if maxSupply == 0', async () => {
      await expect(
        rrg.registerDrop(TOKEN_ID, creator.address, PRICE_6DP, 0)
      ).to.be.revertedWith('RRG: edition size must be 1-50');
    });

    it('reverts if called by non-owner', async () => {
      await expect(
        rrg.connect(creator).registerDrop(TOKEN_ID, creator.address, PRICE_6DP, MAX_SUPPLY)
      ).to.be.reverted;
    });
  });

  describe('mintWithPermit', () => {
    beforeEach(async () => {
      await rrg.registerDrop(TOKEN_ID, creator.address, PRICE_6DP, MAX_SUPPLY);
    });

    it('mints token and splits payment correctly', async () => {
      const rrgAddress      = await rrg.getAddress();
      const mockUsdc        = await ethers.getContractAt('MockUSDC', mockUsdcAddress);
      const deadline        = BigInt(await time.latest()) + 3600n;
      const nonce           = await mockUsdc.nonces(buyer.address);
      const domainSeparator = await mockUsdc.DOMAIN_SEPARATOR();

      // Sign EIP-2612 permit
      const domain = {
        name:              'MockUSDC',
        version:           '1',
        chainId:           (await ethers.provider.getNetwork()).chainId,
        verifyingContract: mockUsdcAddress,
      };
      const types = {
        Permit: [
          { name: 'owner',   type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value',   type: 'uint256' },
          { name: 'nonce',   type: 'uint256' },
          { name: 'deadline',type: 'uint256' },
        ],
      };
      const value = { owner: buyer.address, spender: rrgAddress, value: PRICE_6DP, nonce, deadline };
      const sig   = await buyer.signTypedData(domain, types, value);
      const { v, r, s } = ethers.Signature.from(sig);

      const creatorBefore  = await mockUsdc.balanceOf(creator.address);
      const platformBefore = await mockUsdc.balanceOf(platform.address);
      const buyerBefore    = await mockUsdc.balanceOf(buyer.address);

      await rrg.mintWithPermit(TOKEN_ID, buyer.address, deadline, v, r, s);

      // Check balances
      const expectedCreator  = (PRICE_6DP * 70n) / 100n; // 7_000_000
      const expectedPlatform = PRICE_6DP - expectedCreator; // 3_000_000

      expect(await mockUsdc.balanceOf(creator.address)).to.equal(creatorBefore + expectedCreator);
      expect(await mockUsdc.balanceOf(platform.address)).to.equal(platformBefore + expectedPlatform);
      expect(await mockUsdc.balanceOf(buyer.address)).to.equal(buyerBefore - PRICE_6DP);

      // Check ERC-1155 balance
      expect(await rrg.balanceOf(buyer.address, TOKEN_ID)).to.equal(1);

      // Check minted count
      const drop = await rrg.getDrop(TOKEN_ID);
      expect(drop.minted).to.equal(1);
    });

    it('reverts when sold out', async () => {
      // Register single-edition drop
      await rrg.registerDrop(2, creator.address, PRICE_6DP, 1);
      const mockUsdc  = await ethers.getContractAt('MockUSDC', mockUsdcAddress);
      const rrgAddr   = await rrg.getAddress();
      const deadline  = BigInt(await time.latest()) + 3600n;

      const signPermit = async (signer: HardhatEthersSigner) => {
        const nonce  = await mockUsdc.nonces(signer.address);
        const domain = { name: 'MockUSDC', version: '1', chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: mockUsdcAddress };
        const types  = { Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] };
        const val    = { owner: signer.address, spender: rrgAddr, value: PRICE_6DP, nonce, deadline };
        const sig    = await signer.signTypedData(domain, types, val);
        return ethers.Signature.from(sig);
      };

      // Mint USDC to owner for second purchase attempt
      await mockUsdc.mint(owner.address, PRICE_6DP * 2n);

      const sig1 = await signPermit(buyer);
      await rrg.mintWithPermit(2, buyer.address, deadline, sig1.v, sig1.r, sig1.s);

      const sig2 = await signPermit(owner);
      await expect(
        rrg.mintWithPermit(2, owner.address, deadline, sig2.v, sig2.r, sig2.s)
      ).to.be.revertedWith('RRG: sold out');
    });

    it('reverts when drop is paused', async () => {
      await rrg.pauseDrop(TOKEN_ID);
      const mockUsdc = await ethers.getContractAt('MockUSDC', mockUsdcAddress);
      const deadline = BigInt(await time.latest()) + 3600n;
      const nonce    = await mockUsdc.nonces(buyer.address);
      const rrgAddr  = await rrg.getAddress();
      const domain   = { name: 'MockUSDC', version: '1', chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: mockUsdcAddress };
      const types    = { Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] };
      const val      = { owner: buyer.address, spender: rrgAddr, value: PRICE_6DP, nonce, deadline };
      const sig      = ethers.Signature.from(await buyer.signTypedData(domain, types, val));
      await expect(
        rrg.mintWithPermit(TOKEN_ID, buyer.address, deadline, sig.v, sig.r, sig.s)
      ).to.be.revertedWith('RRG: drop not active');
    });
  });

  describe('pause / unpause', () => {
    it('owner can pause and unpause', async () => {
      await rrg.registerDrop(TOKEN_ID, creator.address, PRICE_6DP, MAX_SUPPLY);
      await rrg.pauseDrop(TOKEN_ID);
      expect((await rrg.getDrop(TOKEN_ID)).active).to.be.false;
      await rrg.unpauseDrop(TOKEN_ID);
      expect((await rrg.getDrop(TOKEN_ID)).active).to.be.true;
    });
  });

  describe('uri', () => {
    it('returns base + tokenId when no per-token URI set', async () => {
      await rrg.registerDrop(TOKEN_ID, creator.address, PRICE_6DP, MAX_SUPPLY);
      // OZ ERC1155 base uri returns the template; per-token override not set
      const u = await rrg.uri(TOKEN_ID);
      expect(u).to.include('realrealgenuine.com');
    });

    it('returns per-token URI when set', async () => {
      await rrg.registerDrop(TOKEN_ID, creator.address, PRICE_6DP, MAX_SUPPLY);
      await rrg.setTokenURI(TOKEN_ID, 'ipfs://QmTest');
      expect(await rrg.uri(TOKEN_ID)).to.equal('ipfs://QmTest');
    });
  });
});
