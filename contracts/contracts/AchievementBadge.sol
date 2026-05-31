// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @title AchievementBadge
/// @notice A free, one-per-wallet ERC-721 "4096 Champion" badge that the UI
///         offers when a player reaches the 4096 tile.
///
/// @dev HONEST DESIGN NOTE — this is NOT cheat-proof:
///      4096base is a fully client-side game. Nothing on-chain can observe or
///      prove that the caller actually reached 4096; `mint()` is an OPEN mint
///      that anyone may call once. The UI only *offers* it on a genuine win,
///      but a determined user could call the contract directly without playing.
///      That trade-off is accepted for this badge.
///
///      A future, tamper-resistant version could require a server-side
///      attestation: a trusted backend signs an EIP-712 message
///      (player, achievement, nonce) after validating the game result, and
///      mint() recovers/verifies that signature before minting. That backend
///      and signature check are intentionally NOT built here.
contract AchievementBadge is ERC721 {
    /// @notice Next token id to assign (also the total minted count).
    uint256 public nextTokenId;

    /// @notice Tracks which wallets have already claimed their badge.
    mapping(address => bool) public hasMinted;

    error AlreadyMinted();

    event BadgeMinted(address indexed to, uint256 indexed tokenId);

    constructor() ERC721("4096 Champion", "4096W") {}

    /// @notice Mint one free champion badge to the caller. Reverts if the caller
    ///         already holds one (one per wallet).
    function mint() external returns (uint256 tokenId) {
        if (hasMinted[msg.sender]) revert AlreadyMinted();

        // Checks-effects-interactions: set state before _safeMint, which may
        // call into an ERC721Receiver on the recipient.
        hasMinted[msg.sender] = true;
        tokenId = nextTokenId;
        nextTokenId = tokenId + 1;

        _safeMint(msg.sender, tokenId);
        emit BadgeMinted(msg.sender, tokenId);
    }
}
