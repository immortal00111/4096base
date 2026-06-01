// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title PremiumNFT
/// @notice Free, one-per-wallet ERC-721 that marks a wallet as a premium / early
///         supporter of 4096base. There is no payment and no owner/admin surface
///         here — anyone can mint exactly once. Holding it is purely a badge of
///         membership; it grants no fees, discounts, or financial rights (the
///         game is free and the app never holds or moves funds).
contract PremiumNFT is ERC721 {
    /// @notice Next token id to be assigned (also the total minted count).
    uint256 public nextTokenId;

    /// @notice Tracks which wallets have already claimed their premium NFT.
    mapping(address => bool) public hasMinted;

    error AlreadyMinted();

    event PremiumMinted(address indexed to, uint256 indexed tokenId);

    constructor() ERC721("4096 Premium", "4096P") {}

    /// @notice Mint one free premium NFT to the caller. Reverts if the caller
    ///         already holds one (one per wallet).
    function mint() external returns (uint256 tokenId) {
        if (hasMinted[msg.sender]) revert AlreadyMinted();

        // Effects before interaction (_safeMint may call the receiver).
        hasMinted[msg.sender] = true;
        tokenId = nextTokenId;
        nextTokenId = tokenId + 1;

        _safeMint(msg.sender, tokenId);
        emit PremiumMinted(msg.sender, tokenId);
    }
}
