# Atomic Swap Reach DApp

back-end:

* retrieves token id & price from seller
* confirms price with buyer
* retrieves payment from buyer
* transfers asset to buyer OR if buyer never pays transfers asset back to seller

front-end:

* creates 2 test accounts and 1 NFT
* logs seller & buyer balances after every step
* exposes simple seller and buyer interface to fulfill back-end contract

sample output:
```

Balances:
  Account: Creator
    * 10 ALGO
  Account: Buyer
    * 10 ALGO

Created asset LOL1 with id 690

Balances:
  Account: Creator
    * 9.999 ALGO
  Account: Buyer
    * 10 ALGO

Minting 1 LOL1 to Creator

Balances:
  Account: Creator
    * 9.998 ALGO
    * 1 LOL1
  Account: Buyer
    * 10 ALGO
    * Not opted into LOL1

Opting buyer into zero-asset

Balances:
  Account: Creator
    * 9.998 ALGO
    * 1 LOL1
  Account: Buyer
    * 9.999 ALGO
    * 0 LOL1

Creator proposes price of 5 ALGO for LOL1

Buyer accepts price of 5 ALGO

Balances:
  Account: Creator
    * 14.989 ALGO
    * 0 LOL1
  Account: Buyer
    * 4.991 ALGO
    * 1 LOL1
```