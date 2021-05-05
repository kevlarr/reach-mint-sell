import * as stdlib_loader from '@reach-sh/stdlib/loader.mjs';
import * as backend from './build/index.main.mjs';
import algosdk from 'algosdk';

(async () => {
  const conn = stdlib_loader.getConnector();

  if (conn !== "ALGO") {
    throw new Error(`Don't use ${conn}`);
  }

  // So many things need access to loaded stdlib that it "makes sense"
  // to define everything inside this function...
  //
  // In the immortal words of Alexis Rose: "Eww!"
  const stdlib = await stdlib_loader.loadStdlib();
  const algod  = await stdlib.getAlgodClient();

  // Helper to format ALGO currency
  const fmt = (x) => `${stdlib.formatCurrency(x, 4)} ALGO`;

  // Helper to create, sign, and submit transaction given some "transaction maker"
  const submitTxn = async (signer, txnMaker) => {
    const params = await stdlib.getTxnParams();

    // Need to create AND sign a transaction before submitting
    const txn = txnMaker(params);
    const stxn = txn.signTxn(signer.sk);

    const sent = (await algod.sendRawTransaction(stxn).do());
    await stdlib.waitForConfirmation(sent.txId);
    return await algod.pendingTransactionInformation(sent.txId).do();
  };

  /*
   * A wrapper around a test account, exposing convenience methods
   * for querying balances, opting into tokens, etc.
   */
  class Account {
    /*
     * Creates a test account with name and starting algos balance
     */
    static async create(name, algos = 10) {
      const startingBalance = stdlib.parseCurrency(algos);
      const acct = await stdlib.newTestAccount(startingBalance);

      return new Account(name, acct);
    }

    constructor(name, acct) {
      this.name = name;
      this.acct = acct;
    }

    get addr() {
      return this.acct.networkAccount.addr;
    }

    get sk() {
      return this.acct.networkAccount.sk;
    }

    /*
     * Returns balance for given token if provided; otherwise,
     * returns balance of ALGO if no token provided.
     */
    async balance(token = null) {
      if (!token) {
        return fmt(await stdlib.balanceOf(this.acct));
      }
      
      const {assets} = await algod.accountInformation(this.addr).do();

      for (const asset of assets) {
        if (asset['asset-id'] === token.assetId) {
          return `${asset['amount']} ${token.symbol}`;
        }
      }

      return `Not opted into ${token.symbol}`;
    }

    /*
     * Opts into the token by submitting a zero-balance transaction
     */
    async optIn(token) {
      await stdlib.transfer(this.acct, this.acct, 0, token.assetId);
    }

    /*
     * Opts out of the provided token by closing out the remainder to
     * the provided account.
     */
    async optOut(token, toAcc) {
      // Returns a transaction maker for closing out the `fromAcct` and transferring
      // all of `assetId` to `toAcct`
      const makeTxn = (assetId, toAcc) => (
        (params) => algosdk.makeAssetTransferTxnWithSuggestedParams(
          this.addr,    // from
          toAcc.addr,   // to
          toAcc.addr,   // closeRemainderTo
          undefined,    // revocationTarget
          0,            // amt
          undefined,    // note
          assetId,      // assetIndex
          params,       // suggestedParams
          // null,         // rekeyTo
        )
      );
      
      await submitTxn(this, makeTxn(token.assetId, toAcc));
    }
  };

  /*
   * An NFT is any ASA with..
   *   Total:    1
   *   Decimals: 0
   * 
   * Only 1 can ever be minted (and minting is still necessary)
   */
  class Nft {
    /*
     * Forms, signs, and submits a transaction to create a new (unminted) NFT
     */
    static async create(creator, name, symbol, note) {
      // Returns a transaction maker for creating a new NFT for the name and symbol
      // linked to the given account
      const makeTxn = (acc, name, symbol, note) => {
        // A "note" string needs to be encoded as a Uint8Array
        let note_bytes = new TextEncoder().encode(note);

        // TODO: null or "" values for clawback, freeze, etc?
        return (params) => algosdk.makeAssetCreateTxnWithSuggestedParams(
          acc.addr,   // from
          note_bytes, // note
          1,          // total
          0,          // decimals
          false,      // defaultFrozen
          acc.addr,   // manager
          acc.addr,   // reserve
          acc.addr,   // freeze
          acc.addr,   // clawback
          symbol,     // unitName
          name,       // assetName
          '',         // assetUrl
          '',         // assetMetadataHash
          params,     // suggestedParams
          // null,       // rekeyTo
        );
      };
      const wat = await submitTxn(creator, makeTxn(creator, name, symbol, note));
      const assetId = wat["asset-index"];

      return new Nft(creator, name, symbol, assetId);
    }

    constructor(creator, name, symbol, assetId) {
      this.creator = creator;
      this.name = name;
      this.symbol = symbol;
      this.assetId = assetId;
    }

    /*
     * Mints the NFT to the given receiver's account.
     *
     * Attempting to define an NFT but minting *more* than 1 would raise an error
     * about "underflow", since minting N tokens would be trying to do "1 - N"
     * and would go below 0 available to mint.
     */
    async mint(receiver) {
      await stdlib.transfer(this.creator.acct, receiver.acct, 1, this.assetId);
    }
  }

  const creator = await Account.create('Creator');
  const buyer   = await Account.create('Buyer');

  const printBalances = async (...tokens) => {
    console.log('\nBalances:');

    for (const acc of [creator, buyer]) {
      console.log(`  Account: ${acc.name}`);
      console.log(`    * ${await acc.balance()}`);

      for (const token of tokens) {
        console.log(`    * ${await acc.balance(token)}`);
      }
    }
  };

  await printBalances();

  const lol1 = await Nft.create(
    creator,
    "Laughing Out Loud",
    "LOL1",
    "Edition 1 of 1",
  );
  console.log(`\nCreated asset ${lol1.symbol} with id ${lol1.assetId}`);
  await printBalances();
  
  // I... think... that the token needs to be minted to the creator (ie. seller)
  // account prior to being transferrable..?
  //
  // Trying to mint more than a single asset will cause an error, as there is
  // only a single one available to mint ever. 
  //
  // Another option MIGHT be to just mint directly to the buyer, rather than
  // the creator, to avoid a transfer..? Not sure if that's a thing and, if so,
  // if there are any advantages. (One less txn fee maybe?)
  console.log(`\nMinting 1 ${lol1.symbol} to ${creator.name}`);
  await lol1.mint(creator, 1);
  await printBalances(lol1);

  // The buyer account has to first *opt into* the asset with a zero balance
  // in order to receive the asset.
  //
  // See: https://developer.algorand.org/docs/features/asa/#receiving-an-asset
  console.log('\nOpting buyer into zero-asset');
  await buyer.optIn(lol1);
  await printBalances(lol1);

  /*
  // OPTING OUT
  console.log(`Demonstrating opt-out on ALGO`);
  console.log(`\tAlice opts out`);
  await lol1.optOut(buyerAcct);

  console.log(`\tAlice can't receive mint`);
  await shouldFail(async () => await zorkmid.mint(accAlice, startingBalance));

  console.log(`\tAlice re-opts-in`);
  await stdlib.transfer(accAlice, accAlice, 0, zorkmid.id);

  console.log(`\tAlice can receive mint`);
  await zorkmid.mint(accAlice, startingBalance);
  */

  const creatorCtc = creator.acct.deploy(backend);
  const buyerCtc   = buyer.acct.attach(backend, creatorCtc.getInfo());

  await Promise.all([
    backend.Seller(creatorCtc, {
      getTokenAndPrice: () => {
        const price = stdlib.parseCurrency(5);
        console.log(`\nCreator proposes price of ${fmt(price)} for LOL1`);
        return [lol1.assetId, price];
      },
    }),
    backend.Buyer(buyerCtc, {
      acceptPrice: (price) => {
        console.log(`\nBuyer accepts price of ${fmt(price)}`);
      },
    }),
  ]);

  await printBalances(lol1);
  console.log();
})();