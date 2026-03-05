// SPDX-License-Identifier: MIT
pragma solidity ^0.8.27;

import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";

/// @dev Test-only mock USDC with 6 decimals and permit support
contract MockUSDC is ERC20Permit {
    constructor() ERC20("MockUSDC", "MUSDC") ERC20Permit("MockUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
