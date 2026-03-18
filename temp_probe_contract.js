const { ethers } = require('/home/agent/agents/drhobbs-8004/mcp-server/node_modules/ethers');
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const REP      = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';
const REP_IMPL = '0x16e0fa7f7c56b9a767e34b192b51f921be31da34';

async function main() {
  const code = await provider.getCode(REP_IMPL);
  console.log('Impl has 3c036a7e (spec selector):', code.includes('3c036a7e'));
  console.log('Impl has c311606a (our selector):', code.includes('c311606a'));

  // Verify spec signature hash
  const specSig      = 'giveFeedback(uint256,int128,uint8,string,string,string,string,bytes32)';
  const specSelector = ethers.id(specSig).slice(0, 10);
  console.log('Spec function selector:', specSelector, '  matches 0x3c036a7e:', specSelector === '0x3c036a7e');

  // Try calling spec function through PROXY with valid-ish params
  try {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const data = specSelector +
      abiCoder.encode(
        ['uint256', 'int128', 'uint8', 'string', 'string', 'string', 'string', 'bytes32'],
        [
          17666n,
          5n,
          0,
          'https://richard-hobbs.com/mcp',
          'https://richard-hobbs.com/api/rrg/signal?to=1&tx=0x' + 'aa'.repeat(32),
          'purchase',
          'rrg',
          ethers.ZeroHash,
        ]
      ).slice(2);
    const result = await provider.call({ to: REP, data });
    console.log('Spec selector call result:', result);
  } catch (e) {
    const msg = String(e.message || '');
    console.log('Spec selector call error (first 600 chars):', msg.substring(0, 600));
  }
}
main().catch(console.error);
