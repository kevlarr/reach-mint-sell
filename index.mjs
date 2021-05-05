import * as stdlib_loader from '@reach-sh/stdlib/loader.mjs';
import * as backend from './build/index.main.mjs';
import algosdk from 'algosdk';


// Returns a transaction maker for creating a new NFT for the name and symbol
// linked to the given account
const newNftTxnMaker = (acc, name, symbol, note) => {
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


// Returns a transaction maker for closing out the `fromAcct` and transferring
// all of `assetId` to `toAcct`
const assetTransferTxnMaker = (assetId, fromAcc, toAcc) => (
  (params) => algosdk.makeAssetTransferTxnWithSuggestedParams(
    fromAcc.addr, // from
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


const runApp = async () => {

  // So many things need access to loaded stdlib that it "makes sense"
  // to define everything inside this function...
  //
  // In the immortal words of Alexis Rose: "Eww!"
  const stdlib = await stdlib_loader.loadStdlib();
  const algod  = await stdlib.getAlgodClient();
  

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


  class Account {
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

    async balance(token = null) {
      if (!token) {
        // Default to ALGO
        return fmt(await stdlib.balanceOf(this.acct));
      }
      
      const {assets} = await algod.accountInformation(this.addr).do();

      for (const asset of assets) {
        if (asset['asset-id'] === token.assetId) {
          return `${asset['amount']} ${token.symbol}`;
        }
      }

      return `NULL ${token.symbol}`;
    }

    async printBalances(...tokens) {
      console.log(`Account: ${this.name}`);
      console.log(`  * ${await this.balance()}`);

      for (const token of tokens) {
        console.log(`  * ${await this.balance(token)}`);
      }
    }

    async optIn(token) {
      await stdlib.transfer(this.acct, this.acct, 0, token.assetId);
    }

    async optOut(token, toAcc) {
      await submitTxn(
        this,
        assetTransferTxnMaker(token.assetId, this, toAcc),
      );
    }
  };


  class Nft {
    static async create(creator, name, symbol, note) {
      const wat = await submitTxn(
        creator,
        newNftTxnMaker(creator, name, symbol, note),
      );
      const assetId = wat["asset-index"];

      return new Nft(creator, name, symbol, assetId);
    }

    constructor(creator, name, symbol, assetId) {
      this.creator = creator;
      this.name = name;
      this.symbol = symbol;
      this.assetId = assetId;
    }

    async mint(receiver, amt) {
      await stdlib.transfer(this.creator.acct, receiver.acct, amt, this.assetId);
    }
  }

  const creator = await Account.create('Creator');
  const buyer   = await Account.create('Buyer');

  console.log();
  await creator.printBalances();
  await buyer  .printBalances();

  // console.log(`Creator: ${creator.addr}`);
  // console.log(`\t${await algoBalance(creator)}`);
  // console.log();

  // console.log(`Buyer:   ${buyer.addr}`);
  // console.log(`\t${await algoBalance(buyer)}`);
  // console.log();

  const lol1 = await Nft.create(
    creator,
    "Laughing Out Loud",
    "LOL1",
    "Edition 1 of 1",
  );
  console.log(`\nCreated asset ${lol1.symbol} with id ${lol1.assetId}`);
  
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

  console.log();
  await creator.printBalances(lol1);
  await buyer  .printBalances(lol1);

  // The buyer account has to first *opt into* the asset with a zero balance
  // in order to receive the asset.
  //
  // See: https://developer.algorand.org/docs/features/asa/#receiving-an-asset
  console.log('\nOpting buyer into zero-asset\n');
  buyer.optIn(lol1);
  await buyer.printBalances(lol1);

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

  console.log();
  await creator.printBalances(lol1);
  await buyer  .printBalances(lol1);
};


(async () => {
  const conn = stdlib_loader.getConnector();

  if (conn !== "ALGO") {
    throw new Error(`Don't use ${conn}`);
  }

  runApp();
})();