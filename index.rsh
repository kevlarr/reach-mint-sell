'reach 0.1';
'use strict';

const Seller = {
  getTokenAndPrice: Fun([], Tuple(Token, UInt)),
};
const Buyer = {
  acceptPrice: Fun([UInt], Null),
};

const DEADLINE = 10;

export const main = Reach.App(
  {},
  [Participant('Seller', Seller), Participant('Buyer', Buyer)],
  (seller, buyer) => {

    // First step is getting the asset id and the requested price
    // from the seller, rather than hardcoding anything
    seller.only(() => {
      const [tokenId, price] = declassify(interact.getTokenAndPrice());
    });

    // This publishes the asset and price onto the chain, and it pays
    // the asset into the contract account
    seller.publish(tokenId, price).pay([ [1, tokenId] ]);
    commit();

    // Give the buyer a chance to review and accept the price.
    //
    // TODO: Is an "accept" phase necessary or should this just always take the payment
    // without giving the buyer's front-end a chance to reject..?
    buyer.only(() => {
      interact.acceptPrice(price);
    });

    // Buyer has accepted the terms and pays ALGO into the contract account
    buyer.pay(price)
      .timeout(DEADLINE, () => {
        // ... but if they don't pay in a certain amount of time, then the contract
        // needs to transfer the asset back to the seller.
        //
        // TODO: Need to "publish" to get to a CONSENSUS step in order to transfer,
        // but does this incur a fee..?
        seller.publish();
        transfer(1, tokenId).to(seller);
        commit();
        exit();
      })

    // Buyer has paid into the contract, so now disberse the asset and funds
    // out of the contract
    transfer(1, tokenId).to(buyer);
    transfer(price).to(seller);

    commit();
    exit();
  }
);