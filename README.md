simple atomic swap Reach DApp

back-end:
    * retrieves token id & price from seller
    * confirms price with buyer
    * retrieves payment from buyer
    * transfers asset to buyer OR if buyer never pays transfers asset back to seller

front-end:
    * creates 2 test accounts and 1 NFT
    * logs seller & buyer balances after every step
    * exposes simple seller and buyer interface to fulfill back-end contract