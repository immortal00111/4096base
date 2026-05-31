// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title DiscountNFT
/// @notice Free, one-per-wallet ERC-721. Holding one qualifies a wallet for the
///         discounted play fee in {GamePayment}. There is no payment and no
///         owner/admin surface here — anyone can mint exactly once.
contract DiscountNFT is ERC721 {
    /// @notice Next token id to be assigned (also the total minted count).
    uint256 public nextTokenId;

    /// @notice Tracks which wallets have already claimed their free NFT.
    mapping(address => bool) public hasMinted;

    error AlreadyMinted();

    event DiscountMinted(address indexed to, uint256 indexed tokenId);

    constructor() ERC721("4096 Base Discount", "4096D") {}

    /// @notice Mint one free discount NFT to the caller. Reverts if the caller
    ///         already holds one (one per wallet).
    function mint() external returns (uint256 tokenId) {
        if (hasMinted[msg.sender]) revert AlreadyMinted();

        // Effects before interaction (_safeMint may call the receiver).
        hasMinted[msg.sender] = true;
        tokenId = nextTokenId;
        nextTokenId = tokenId + 1;

        _safeMint(msg.sender, tokenId);
        emit DiscountMinted(msg.sender, tokenId);
    }
}
