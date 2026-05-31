// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";

/// @title GamePayment
/// @notice Per-game ETH pay-to-play for 4096base. Wallets holding the
///         {DiscountNFT} pay a reduced fee. Collected ETH is withdrawable by
///         the owner to a configurable receiver.
/// @dev Follows checks-effects-interactions; withdraw is owner-only and
///      nonReentrant. Fees, receiver, and the discount NFT are owner-updatable.
contract GamePayment is Ownable, ReentrancyGuard {
    /// @notice Standard fee charged to play one game (wei).
    uint256 public baseFee;

    /// @notice Reduced fee charged to discount-NFT holders (wei).
    uint256 public discountFee;

    /// @notice Address that receives withdrawn funds.
    address public receiver;

    /// @notice Discount NFT; holding any balance qualifies for {discountFee}.
    IERC721 public discountNFT;

    error IncorrectPayment(uint256 sent, uint256 required);
    error ZeroAddress();
    error NothingToWithdraw();
    error WithdrawFailed();

    event GamePaid(address indexed player, uint256 amount, uint256 timestamp);
    event FeesUpdated(uint256 baseFee, uint256 discountFee);
    event ReceiverUpdated(address indexed receiver);
    event DiscountNFTUpdated(address indexed discountNFT);
    event Withdrawn(address indexed receiver, uint256 amount);

    constructor(
        address initialOwner,
        address initialReceiver,
        address discountNFT_,
        uint256 baseFee_,
        uint256 discountFee_
    ) Ownable(initialOwner) {
        if (initialReceiver == address(0)) revert ZeroAddress();
        receiver = initialReceiver;
        discountNFT = IERC721(discountNFT_);
        baseFee = baseFee_;
        discountFee = discountFee_;
    }

    /// @notice The fee a given player must pay, accounting for NFT discount.
    function currentFee(address player) public view returns (uint256) {
        if (address(discountNFT) != address(0) && discountNFT.balanceOf(player) > 0) {
            return discountFee;
        }
        return baseFee;
    }

    /// @notice Pay for one game. Charges {currentFee} for msg.sender; any excess
    ///         ETH is accepted and retained (kept simple to avoid a refund
    ///         re-entrancy surface). Emits {GamePaid} on success.
    function pay() external payable {
        uint256 fee = currentFee(msg.sender);
        if (msg.value < fee) revert IncorrectPayment(msg.value, fee);
        emit GamePaid(msg.sender, msg.value, block.timestamp);
    }

    /// @notice Withdraw the full contract balance to {receiver}. Owner-only and
    ///         reentrancy-guarded; uses .call and checks success.
    function withdraw() external onlyOwner nonReentrant {
        uint256 balance = address(this).balance;
        if (balance == 0) revert NothingToWithdraw();

        address to = receiver;
        (bool ok, ) = payable(to).call{value: balance}("");
        if (!ok) revert WithdrawFailed();

        emit Withdrawn(to, balance);
    }

    /// @notice Update both fees. Owner-only.
    function setFees(uint256 baseFee_, uint256 discountFee_) external onlyOwner {
        baseFee = baseFee_;
        discountFee = discountFee_;
        emit FeesUpdated(baseFee_, discountFee_);
    }

    /// @notice Update the withdrawal receiver. Owner-only.
    function setReceiver(address receiver_) external onlyOwner {
        if (receiver_ == address(0)) revert ZeroAddress();
        receiver = receiver_;
        emit ReceiverUpdated(receiver_);
    }

    /// @notice Update the discount NFT contract. Owner-only.
    function setDiscountNFT(address discountNFT_) external onlyOwner {
        discountNFT = IERC721(discountNFT_);
        emit DiscountNFTUpdated(discountNFT_);
    }
}
