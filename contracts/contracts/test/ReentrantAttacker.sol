// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {GamePayment} from "../GamePayment.sol";

/// @notice Test-only contract that attempts to re-enter {GamePayment.withdraw}
///         from its receive() hook. Used to prove the nonReentrant guard holds.
/// @dev This contract is set as the GamePayment receiver, then made owner so it
///      can call withdraw(). When it receives ETH mid-withdraw it tries to call
///      withdraw() again; the guard must cause that nested call to revert.
contract ReentrantAttacker {
    GamePayment public immutable target;
    bool public reentered;

    constructor(GamePayment target_) {
        target = target_;
    }

    /// @notice Kick off the (re-entrant) withdrawal.
    function attack() external {
        target.withdraw();
    }

    /// @notice Pay into the target so there is a balance to withdraw.
    function fund() external payable {
        target.pay{value: msg.value}();
    }

    receive() external payable {
        // Try to re-enter exactly once. The nonReentrant guard should make this
        // nested withdraw() revert; we swallow it so the outer call's success
        // depends purely on the guard, and record that we tried.
        if (!reentered) {
            reentered = true;
            try target.withdraw() {
                // Should never reach here — re-entry must be blocked.
            } catch {
                // Expected: nonReentrant reverts the nested call.
            }
        }
    }
}
