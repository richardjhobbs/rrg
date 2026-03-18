
// --- Tool: get_feedback_tx ---
server.registerTool(
  'get_feedback_tx',
  {
    title: 'Get Feedback Transaction Data (ERC-8004)',
    description: `Returns the encoded transaction data for a buying agent to submit their own ERC-8004 reputation signal about drhobbs Agent to the on-chain Reputation Registry.

This completes the trust loop: after drhobbs signals you (via signal_transaction_trust), you signal drhobbs back.

The buying agent signs and broadcasts this transaction from their own registered ERC-8004 wallet.
drhobbs cannot do this on your behalf — your signature is what makes the signal authentic.

Prerequisite: your wallet must be a registered ERC-8004 agent (balanceOf > 0 on Base mainnet).

Steps:
  1. Call this tool with your tx_hash and token_id
  2. Use your agent wallet to send the returned transaction to Base mainnet
  3. Confirm with any Base explorer — the signal is now on-chain

Args:
  - tx_hash: The USDC payment transaction hash from your purchase
  - token_id: The RRG drop token ID you purchased`,
    inputSchema: z.object({
      tx_hash:  z.string().regex(/^0x[0-9a-fA-F]{64}$/).describe('Your USDC payment transaction hash'),
      token_id: z.number().int().positive().describe('RRG drop token ID you purchased'),
    }),
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true }
  },
  async ({ tx_hash, token_id }) => {
    try {
      const { ethers } = await import('ethers');
      const REPUTATION_REGISTRY = '0x8004BAa17C55a88189AE136b182e5fdA19dE9b63';
      const DRHOBBS_AGENT_ID    = 17666n;

      const iface = new ethers.Interface([
        'function giveFeedback(uint256 agentId, int256 value, uint8 valueDecimals, bytes32 tag1, bytes32 tag2, string calldata endpoint, string calldata feedbackURI, bytes32 feedbackHash) external',
      ]);

      const feedbackHash = ethers.keccak256(ethers.toUtf8Bytes(tx_hash));
      const feedbackURI  = `https://richard-hobbs.com/rrg/drop/${token_id}`;
      const endpoint     = 'https://richard-hobbs.com/mcp';

      const calldata = iface.encodeFunctionData('giveFeedback', [
        DRHOBBS_AGENT_ID,
        5n,
        0,
        ethers.encodeBytes32String('purchase'),
        ethers.encodeBytes32String('rrg'),
        endpoint,
        feedbackURI,
        feedbackHash,
      ]);

      const output = {
        instruction: 'Sign and send this transaction from your registered ERC-8004 agent wallet on Base mainnet to signal trust in drhobbs Agent for your completed purchase.',
        transaction: {
          to:       REPUTATION_REGISTRY,
          data:     calldata,
          value:    '0x0',
          chainId:  8453,
          network:  'base-mainnet',
        },
        context: {
          targetAgent:  `drhobbs Agent #${DRHOBBS_AGENT_ID}`,
          value:        5,
          tag1:         'purchase',
          tag2:         'rrg',
          feedbackHash,
          feedbackURI,
          endpoint,
          sourceTxHash: tx_hash,
        },
        note: 'Your wallet must be a registered ERC-8004 agent to submit this signal. Send the transaction using your agent wallet on Base mainnet (chainId 8453). No ETH value required — only gas.',
      };

      return {
        content: [{ type: 'text', text: JSON.stringify(output, null, 2) }],
        structuredContent: output,
      };
    } catch (err) {
      return {
        content: [{ type: 'text', text: `Error preparing feedback transaction: ${err.message}` }],
        isError: true,
      };
    }
  }
);

