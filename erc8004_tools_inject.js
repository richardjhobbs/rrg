
// ============================================
// ERC-8004 TRUST & REPUTATION TOOLS
// ============================================

// --- Tool: check_agent_trust ---
server.registerTool(
  'check_agent_trust',
  {
    title: 'Check Agent Trust (ERC-8004)',
    description: `Verify drhobbs Agent's on-chain identity and trust status via the ERC-8004 registry on Base mainnet.

Returns live blockchain data:
- Registration status in the ERC-8004 Identity Registry
- Agent ID (#17666) and 8004scan profile URL
- Identity URI (agent.json) and whether it matches the on-chain record
- Owner wallet (the wallet that receives payments)

Use this to verify you are dealing with a registered, on-chain trusted agent before transacting.
Registered agents have a cryptographically verifiable identity and an on-chain reputation history.`,
    inputSchema: z.object({}),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  async () => {
    try {
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(CONFIG.baseRpcUrl);
      const IDENTITY_REGISTRY = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
      const AGENT_ID = BigInt(CONFIG.agentId);
      const iface = new ethers.Interface([
        'function tokenURI(uint256 tokenId) view returns (string)',
        'function ownerOf(uint256 tokenId) view returns (address)',
      ]);

      const [tokenUri, owner] = await Promise.all([
        provider.call({ to: IDENTITY_REGISTRY, data: iface.encodeFunctionData('tokenURI', [AGENT_ID]) })
          .then(r => ethers.AbiCoder.defaultAbiCoder().decode(['string'], r)[0])
          .catch(() => null),
        provider.call({ to: IDENTITY_REGISTRY, data: iface.encodeFunctionData('ownerOf', [AGENT_ID]) })
          .then(r => ethers.AbiCoder.defaultAbiCoder().decode(['address'], r)[0])
          .catch(() => null),
      ]);

      const EXPECTED_URI = 'https://richard-hobbs.com/agent.json';
      const output = {
        registered: !!tokenUri,
        agentId: CONFIG.agentId,
        network: 'base-mainnet',
        identityRegistry: IDENTITY_REGISTRY,
        reputationRegistry: '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63',
        tokenUri,
        uriCurrent: tokenUri === EXPECTED_URI,
        ownerWallet: owner,
        paymentWallet: CONFIG.agentWallet,
        profileUrl: `https://8004scan.io/agents/base/${CONFIG.agentId}`,
        agentJson: EXPECTED_URI,
        protocol: 'ERC-8004 (EIP-8004)',
        note: 'ERC-8004 is an on-chain agent identity and reputation standard on Base. The owner wallet is the payment address. Registered agents build verifiable on-chain reputation through completed transactions.',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error reading agent trust data: ${err.message}` }],
        isError: true,
      };
    }
  }
);

// --- Tool: signal_transaction_trust ---
server.registerTool(
  'signal_transaction_trust',
  {
    title: 'Signal Transaction Trust (ERC-8004)',
    description: `After a completed RRG purchase, drhobbs Agent issues an on-chain ERC-8004 reputation signal to the buying agent, acknowledging the transaction was legitimate and completed successfully.

Only fires if the buyer wallet is itself a registered ERC-8004 agent (balanceOf > 0 on Base mainnet). Non-agent buyer wallets are skipped gracefully.

The signal is sent FROM drhobbs Agent (#17666) TO the buying agent — a cryptographic acknowledgement that drhobbs recognises this agent as a legitimate counterparty.

Call this after confirm_rrg_purchase to complete the trust loop.

Args:
  - buyer_wallet: The wallet address of the purchasing agent
  - tx_hash: The on-chain USDC payment transaction hash (used as unique signal identifier)
  - token_id: The RRG drop token ID purchased`,
    inputSchema: z.object({
      buyer_wallet: z.string().regex(/^0x[0-9a-fA-F]{40}$/).describe('Buyer wallet address'),
      tx_hash:      z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe('USDC payment transaction hash'),
      token_id:     z.number().int().positive().describe('RRG drop token ID'),
    }),
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false }
  },
  async ({ buyer_wallet, tx_hash, token_id }) => {
    try {
      const { ethers } = await import('ethers');
      const provider = new ethers.JsonRpcProvider(CONFIG.baseRpcUrl);
      const IDENTITY_REGISTRY   = '0x8004A169FB4a3325136EB29fA0ceB6D2e539a432';
      const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';

      // 1. Check if buyer is a registered ERC-8004 agent
      const balanceData = ethers.id('balanceOf(address)').slice(0, 10) +
        ethers.AbiCoder.defaultAbiCoder().encode(['address'], [buyer_wallet]).slice(2);
      const balanceResult = await provider.call({ to: IDENTITY_REGISTRY, data: balanceData }).catch(() => null);

      if (!balanceResult) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ signaled: false, reason: 'registry_read_failed', buyerWallet: buyer_wallet }) }],
          structuredContent: { signaled: false, reason: 'registry_read_failed' },
        };
      }

      const buyerAgentCount = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], balanceResult)[0];
      if (buyerAgentCount === 0n) {
        return {
          content: [{ type: 'text', text: JSON.stringify({
            signaled: false,
            reason: 'buyer_not_registered_agent',
            note: 'Buyer wallet has no ERC-8004 identity. No on-chain signal sent. Transaction acknowledged off-chain only.',
            buyerWallet: buyer_wallet,
          }) }],
          structuredContent: { signaled: false, reason: 'buyer_not_registered_agent' },
        };
      }

      // 2. Resolve buyer's ERC-8004 agent ID
      const tokenOfOwnerData = ethers.id('tokenOfOwnerByIndex(address,uint256)').slice(0, 10) +
        ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [buyer_wallet, 0n]).slice(2);
      const tokenResult = await provider.call({ to: IDENTITY_REGISTRY, data: tokenOfOwnerData }).catch(() => null);

      if (!tokenResult) {
        return {
          content: [{ type: 'text', text: JSON.stringify({ signaled: false, reason: 'agent_id_not_resolvable', buyerWallet: buyer_wallet }) }],
          structuredContent: { signaled: false, reason: 'agent_id_not_resolvable' },
        };
      }

      const buyerAgentId = ethers.AbiCoder.defaultAbiCoder().decode(['uint256'], tokenResult)[0];

      // 3. Fire reputation signal: DrHobbs -> buyer agent
      const signer = new ethers.Wallet(process.env.AGENT_PRIVATE_KEY, provider);
      const reputationContract = new ethers.Contract(REPUTATION_REGISTRY, [
        'function giveFeedback(uint256 agentId, int256 value, uint8 valueDecimals, bytes32 tag1, bytes32 tag2, string calldata endpoint, string calldata feedbackURI, bytes32 feedbackHash) external',
      ], signer);

      const tag1         = ethers.encodeBytes32String('purchase');
      const tag2         = ethers.encodeBytes32String('rrg');
      const feedbackHash = ethers.keccak256(ethers.toUtf8Bytes(tx_hash));
      const feedbackURI  = `https://richard-hobbs.com/rrg/drop/${token_id}`;
      const endpoint     = 'https://richard-hobbs.com/mcp';

      const tx = await reputationContract.giveFeedback(
        buyerAgentId, 5n, 0, tag1, tag2, endpoint, feedbackURI, feedbackHash
      );
      const receipt = await tx.wait();

      const output = {
        signaled:    true,
        from:        `drhobbs Agent #${CONFIG.agentId}`,
        to:          `Buyer Agent #${buyerAgentId.toString()}`,
        buyerWallet: buyer_wallet,
        txHash:      receipt.hash,
        block:       receipt.blockNumber,
        feedbackHash,
        value:       5,
        tag1:        'purchase',
        tag2:        'rrg',
        note:        'On-chain ERC-8004 reputation signal sent: drhobbs acknowledges a successful transaction with this buying agent.',
      };

      console.log(`ERC-8004 signal sent to Agent #${buyerAgentId} (tx: ${receipt.hash.slice(0,10)}...)`);
      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error sending reputation signal: ${err.message}` }],
        isError: true,
      };
    }
  }
);

