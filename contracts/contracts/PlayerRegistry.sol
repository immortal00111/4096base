// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @title PlayerRegistry
/// @notice On-chain player accounts and high scores for 4096base: a wallet
///         registers a display name, then submits scores; the contract keeps
///         each player's highest. Registered players can be enumerated for a
///         global leaderboard.
///
/// @dev HONEST DESIGN NOTE — this is NOT cheat-proof.
///      4096base is a fully client-side game. Nothing on-chain can observe or
///      verify that a submitted score was actually earned, and both the name
///      and the score are entirely user-submitted. `submitScore` will faithfully
///      record whatever number the caller sends. A tamper-resistant version
///      would require a trusted backend to sign an EIP-712 attestation of the
///      result that this contract verifies before recording — that backend and
///      signature check are intentionally NOT built here.
///
///      This contract holds NO funds: no function is payable, there is no
///      withdrawal path, and there is no owner/admin over funds (or over other
///      users' data — each caller can only write their own name/score). It only
///      stores strings and numbers callers submit about themselves. Every
///      state-changing function emits an event; there are no external calls, so
///      checks-effects-interactions is trivially satisfied.
contract PlayerRegistry {
    struct Player {
        string name;
        uint256 highScore;
        bool registered;
    }

    /// @dev Per-address account record. Private; exposed via the typed views.
    mapping(address => Player) private players;

    /// @dev Append-only list of registered addresses, for leaderboard
    ///      enumeration. An address appears at most once (added on first
    ///      registration only; name updates do not re-append).
    address[] private playerList;

    error EmptyName();
    error NotRegistered();

    event PlayerRegistered(address indexed player, string name);
    event ScoreSubmitted(address indexed player, uint256 score);

    /// @notice Create an account by setting your display name. Calling again
    ///         while already registered updates the name (no duplicate entry).
    /// @param name Non-empty display name (UTF-8 bytes).
    function register(string calldata name) external {
        if (bytes(name).length == 0) revert EmptyName();

        Player storage p = players[msg.sender];
        if (!p.registered) {
            p.registered = true;
            playerList.push(msg.sender);
        }
        p.name = name;

        emit PlayerRegistered(msg.sender, name);
    }

    /// @notice Submit a score for the caller; only the highest is retained.
    ///         Must be registered first. The event is emitted on every call so
    ///         off-chain indexers see each submission, even when it isn't a new
    ///         personal best.
    /// @param score The self-reported score (see the cheat-proofing note above).
    function submitScore(uint256 score) external {
        Player storage p = players[msg.sender];
        if (!p.registered) revert NotRegistered();

        if (score > p.highScore) {
            p.highScore = score;
        }

        emit ScoreSubmitted(msg.sender, score);
    }

    /// @notice The display name for a player ("" if never registered).
    function nameOf(address player) external view returns (string memory) {
        return players[player].name;
    }

    /// @notice The highest score recorded for a player (0 if none).
    function highScoreOf(address player) external view returns (uint256) {
        return players[player].highScore;
    }

    /// @notice Whether an address has registered an account.
    function isRegistered(address player) external view returns (bool) {
        return players[player].registered;
    }

    /// @notice Number of registered players.
    function playerCount() external view returns (uint256) {
        return playerList.length;
    }

    /// @notice The address of the registered player at a list index.
    function playerAt(uint256 index) external view returns (address) {
        return playerList[index];
    }

    /// @notice All registered player addresses (enumeration for the leaderboard).
    function getPlayers() external view returns (address[] memory) {
        return playerList;
    }

    /// @notice Convenience read: every registered player's address, name, and
    ///         high score in parallel arrays, so a leaderboard can be built in a
    ///         single call.
    function getAllPlayers()
        external
        view
        returns (
            address[] memory addrs,
            string[] memory names,
            uint256[] memory highScores
        )
    {
        uint256 n = playerList.length;
        addrs = new address[](n);
        names = new string[](n);
        highScores = new uint256[](n);
        for (uint256 i = 0; i < n; i++) {
            address a = playerList[i];
            addrs[i] = a;
            names[i] = players[a].name;
            highScores[i] = players[a].highScore;
        }
    }
}
