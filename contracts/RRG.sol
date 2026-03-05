// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @dev Minimal USDC interface with EIP-2612 permit support
interface IUSDC is IERC20 {
    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external;
}

/**
 * @title RRG — Real Real Genuine
 * @notice ERC-1155 drop contract. Each approved design is a tokenId.
 *         Buyers pay USDC via EIP-2612 permit. Revenue splits 70/30
 *         between creator and platform in a single atomic transaction.
 */
contract RRG is ERC1155, Ownable, ReentrancyGuard {

    // ── Types ─────────────────────────────────────────────────────────

    struct Drop {
        address creator;
        uint256 priceUsdc;   // 6 decimal places (10 USDC = 10_000_000)
        uint256 maxSupply;   // max 50, enforced on registration
        uint256 minted;
        bool    active;
    }

    // ── State ─────────────────────────────────────────────────────────

    IUSDC   public immutable usdc;
    address public immutable platformWallet;

    mapping(uint256 => Drop) private _drops;
    mapping(uint256 => string) private _tokenURIs;

    // ── Events ────────────────────────────────────────────────────────

    event DropRegistered(
        uint256 indexed tokenId,
        address indexed creator,
        uint256 priceUsdc,
        uint256 maxSupply
    );

    event Minted(
        uint256 indexed tokenId,
        address indexed buyer,
        uint256 creatorShare,
        uint256 platformShare
    );

    event DropPaused(uint256 indexed tokenId);
    event DropUnpaused(uint256 indexed tokenId);
    event TokenURISet(uint256 indexed tokenId, string uri);

    // ── Constructor ───────────────────────────────────────────────────

    /**
     * @param _usdc           USDC contract address (6 decimals)
     * @param _platformWallet Receives 30% of each sale
     * @param _baseUri        ERC-1155 base URI (e.g. "https://richard-hobbs.com/api/rrg/drops/")
     */
    constructor(
        address _usdc,
        address _platformWallet,
        string memory _baseUri
    ) ERC1155(_baseUri) Ownable(msg.sender) {
        require(_usdc != address(0), "RRG: zero usdc");
        require(_platformWallet != address(0), "RRG: zero platform wallet");
        usdc = IUSDC(_usdc);
        platformWallet = _platformWallet;
    }

    // ── Admin: Drop Management ─────────────────────────────────────────

    /**
     * @notice Register an approved design as a purchasable drop.
     * @param tokenId      Unique token ID (assigned by admin, must not exist)
     * @param creator      Creator's wallet — receives 70% of sales
     * @param priceUsdc6dp Price in USDC with 6 decimal places (e.g. 10 USDC = 10_000_000)
     * @param maxSupply    Edition size. Must be 1–50.
     */
    function registerDrop(
        uint256 tokenId,
        address creator,
        uint256 priceUsdc6dp,
        uint256 maxSupply
    ) external onlyOwner {
        require(_drops[tokenId].creator == address(0), "RRG: tokenId already registered");
        require(creator != address(0), "RRG: zero creator");
        require(priceUsdc6dp > 0, "RRG: zero price");
        require(maxSupply > 0 && maxSupply <= 50, "RRG: edition size must be 1-50");

        _drops[tokenId] = Drop({
            creator:    creator,
            priceUsdc:  priceUsdc6dp,
            maxSupply:  maxSupply,
            minted:     0,
            active:     true
        });

        emit DropRegistered(tokenId, creator, priceUsdc6dp, maxSupply);
    }

    /**
     * @notice Set or update the metadata URI for a token.
     *         Called after IPFS upload completes.
     */
    function setTokenURI(uint256 tokenId, string calldata tokenUri) external onlyOwner {
        require(_drops[tokenId].creator != address(0), "RRG: drop not found");
        _tokenURIs[tokenId] = tokenUri;
        emit TokenURISet(tokenId, tokenUri);
    }

    function pauseDrop(uint256 tokenId) external onlyOwner {
        require(_drops[tokenId].creator != address(0), "RRG: drop not found");
        _drops[tokenId].active = false;
        emit DropPaused(tokenId);
    }

    function unpauseDrop(uint256 tokenId) external onlyOwner {
        require(_drops[tokenId].creator != address(0), "RRG: drop not found");
        _drops[tokenId].active = true;
        emit DropUnpaused(tokenId);
    }

    // ── Purchase ───────────────────────────────────────────────────────

    /**
     * @notice Purchase a drop using an EIP-2612 permit signature.
     *         The buyer signs a permit off-chain; the server submits this
     *         transaction, paying gas on behalf of the buyer.
     *
     * @param tokenId  The drop to purchase
     * @param buyer    Address that will receive the token and pay USDC
     * @param deadline Permit expiry timestamp
     * @param v        Permit signature component
     * @param r        Permit signature component
     * @param s        Permit signature component
     */
    function mintWithPermit(
        uint256 tokenId,
        address buyer,
        uint256 deadline,
        uint8   v,
        bytes32 r,
        bytes32 s
    ) external nonReentrant {
        Drop storage drop = _drops[tokenId];

        require(drop.creator != address(0), "RRG: drop not found");
        require(drop.active,                "RRG: drop not active");
        require(drop.minted < drop.maxSupply, "RRG: sold out");
        require(buyer != address(0),        "RRG: zero buyer");

        uint256 price = drop.priceUsdc;

        // Execute permit — approves this contract to pull price USDC from buyer
        usdc.permit(buyer, address(this), price, deadline, v, r, s);

        // Split payment atomically
        uint256 creatorShare  = (price * 70) / 100;
        uint256 platformShare = price - creatorShare;

        require(
            usdc.transferFrom(buyer, drop.creator, creatorShare),
            "RRG: creator transfer failed"
        );
        require(
            usdc.transferFrom(buyer, platformWallet, platformShare),
            "RRG: platform transfer failed"
        );

        // Mint 1 token to buyer
        drop.minted += 1;
        _mint(buyer, tokenId, 1, "");

        emit Minted(tokenId, buyer, creatorShare, platformShare);
    }

    // ── Views ──────────────────────────────────────────────────────────

    function getDrop(uint256 tokenId) external view returns (Drop memory) {
        return _drops[tokenId];
    }

    /**
     * @dev Returns per-token URI if set, otherwise falls back to base URI + tokenId.
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        string memory tokenUri = _tokenURIs[tokenId];
        if (bytes(tokenUri).length > 0) {
            return tokenUri;
        }
        return super.uri(tokenId);
    }
}
