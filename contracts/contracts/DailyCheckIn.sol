// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";

/// @dev Minimal view we need from the deployed PlayerRegistry.
interface IPlayerRegistry {
    function isRegistered(address player) external view returns (bool);
}

/// @title DailyCheckIn
/// @notice A once-per-UTC-day check-in for registered 4096base players. The
///         first check-in mints a single soulbound-style "check-in" ERC-721 to
///         the wallet; every later check-in just updates the wallet's streak,
///         longest streak, and total count on-chain (no new token is minted).
///
/// @dev HONEST DESIGN NOTE — a check-in only proves the wallet sent a
///      transaction on a given UTC calendar day. It does NOT prove the player
///      played the game, and "UTC day" is derived from block.timestamp
///      (block.timestamp / 86400), which validators may nudge by a few seconds
///      near a day boundary. It is a fun engagement counter, not a tamper-proof
///      record. This contract holds NO funds (not payable, no withdrawal), has
///      no owner/admin, and each caller can only update their own state.
///      Follows checks-effects-interactions: registration + same-day checks
///      run first, state is written before the only external interaction
///      (_safeMint on the first check-in), and re-entry would revert with
///      AlreadyCheckedInToday since the day is already recorded.
contract DailyCheckIn is ERC721 {
    /// @notice The PlayerRegistry used to gate check-ins to registered players.
    IPlayerRegistry public immutable registry;

    /// @notice Next token id to assign (also the number of check-in NFTs minted).
    uint256 public nextTokenId;

    struct Record {
        uint256 lastDay; // UTC day index (timestamp/86400) of the last check-in
        uint256 currentStreak; // consecutive-day streak ending on lastDay
        uint256 longestStreak; // best streak this wallet has ever reached
        uint256 totalCheckIns; // lifetime number of check-ins
    }

    mapping(address => Record) private records;

    error NotRegistered();
    error AlreadyCheckedInToday();
    error ZeroAddress();

    event CheckedIn(address indexed player, uint256 day, uint256 streak);

    constructor(address registry_) ERC721("4096 Daily Check-In", "4096CI") {
        if (registry_ == address(0)) revert ZeroAddress();
        registry = IPlayerRegistry(registry_);
    }

    /// @notice Claim today's check-in. Mints the NFT on the first ever check-in
    ///         and updates the caller's streak; reverts if the caller isn't
    ///         registered or already checked in this UTC day.
    function checkIn() external {
        // --- Checks ---
        if (!registry.isRegistered(msg.sender)) revert NotRegistered();

        uint256 today = block.timestamp / 1 days;
        Record storage r = records[msg.sender];
        bool first = r.totalCheckIns == 0;
        if (!first && r.lastDay == today) revert AlreadyCheckedInToday();

        // --- Effects ---
        uint256 newStreak;
        if (first || r.lastDay != today - 1) {
            // First ever check-in, or a gap of 2+ days: streak restarts at 1.
            newStreak = 1;
        } else {
            // Exactly yesterday: extend the streak.
            newStreak = r.currentStreak + 1;
        }

        r.currentStreak = newStreak;
        if (newStreak > r.longestStreak) r.longestStreak = newStreak;
        r.lastDay = today;
        r.totalCheckIns += 1;

        // --- Interaction --- (only on the first check-in)
        if (first) {
            uint256 tokenId = nextTokenId;
            nextTokenId = tokenId + 1;
            _safeMint(msg.sender, tokenId);
        }

        emit CheckedIn(msg.sender, today, newStreak);
    }

    /// @notice Current consecutive-day streak for a player.
    function currentStreak(address player) external view returns (uint256) {
        return records[player].currentStreak;
    }

    /// @notice Best streak the player has ever reached.
    function longestStreak(address player) external view returns (uint256) {
        return records[player].longestStreak;
    }

    /// @notice UTC day index of the player's most recent check-in (0 if none).
    function lastCheckInDay(address player) external view returns (uint256) {
        return records[player].lastDay;
    }

    /// @notice Lifetime number of check-ins by the player.
    function totalCheckIns(address player) external view returns (uint256) {
        return records[player].totalCheckIns;
    }

    /// @notice True if the player has not yet checked in during the current UTC
    ///         day (i.e. a check-in would succeed, assuming they're registered).
    function canCheckIn(address player) external view returns (bool) {
        Record storage r = records[player];
        if (r.totalCheckIns == 0) return true;
        return r.lastDay != block.timestamp / 1 days;
    }

    /// @notice True once the player has minted their check-in NFT.
    function hasCheckInNFT(address player) external view returns (bool) {
        return balanceOf(player) > 0;
    }
}
