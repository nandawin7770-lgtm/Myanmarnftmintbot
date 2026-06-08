require("dotenv").config();
const { Telegraf } = require("telegraf");
const { ethers } = require("ethers");

const bot = new Telegraf(process.env.BOT_TOKEN);

// =====================
// Session Management
// wallets: Map<label, { privateKey, wallet }>
// activeWallet: label string
// =====================
const userSessions = new Map();

function getSession(userId) {
  if (!userSessions.has(userId)) {
    userSessions.set(userId, {
      wallets: new Map(),       // label => { privateKey, wallet }
      activeWallet: null,       // currently selected wallet label
      contractAddress: null,
      abi: null,
      rpcUrl: process.env.RPC_URL || "https://eth-mainnet.g.alchemy.com/v2/YOUR_KEY",
    });
  }
  return userSessions.get(userId);
}

function getActiveWallet(session) {
  if (!session.activeWallet) return null;
  return session.wallets.get(session.activeWallet) || null;
}

function shortAddr(addr) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

// =====================
// /start
// =====================
bot.start((ctx) => {
  const name = ctx.from.first_name || "User";
  ctx.reply(
    `ðŸ‘‹ á€™á€„á€ºá€¹á€‚á€œá€¬á€•á€« ${name}!\n\n` +
    `ðŸŽ¯ *NFT WL Mint Bot* (Multi-Wallet)\n\n` +
    `ðŸ’¼ *Wallet Commands:*\n` +
    `âž• /addwallet â€” Wallet á€‘á€Šá€·á€º\n` +
    `ðŸ“‹ /wallets â€” Wallet list á€€á€¼á€Šá€·á€º\n` +
    `âœ… /usewallet â€” Active wallet á€›á€½á€±á€¸\n` +
    `ðŸ—‘ï¸ /removewallet â€” Wallet á€–á€»á€€á€º\n` +
    `ðŸ—‘ï¸ /clearwallets â€” Wallets á€¡á€¬á€¸á€œá€¯á€¶á€¸á€–á€»á€€á€º\n\n` +
    `ðŸ“„ *Contract Commands:*\n` +
    `ðŸ“„ /setcontract â€” Contract address á€‘á€Šá€·á€º\n` +
    `âš™ï¸ /setabi â€” ABI á€‘á€Šá€·á€º\n\n` +
    `ðŸš€ *Mint Commands:*\n` +
    `ðŸš€ /mint â€” Active wallet á€”á€²á€· mint\n` +
    `ðŸš€ /mintall â€” Wallets á€¡á€¬á€¸á€œá€¯á€¶á€¸á€”á€²á€· mint\n\n` +
    `ðŸ“Š /status â€” Status á€€á€¼á€Šá€·á€º\n` +
    `ðŸŒ /setrpc â€” RPC URL á€•á€¼á€±á€¬á€„á€ºá€¸`,
    { parse_mode: "Markdown" }
  );
});

// =====================
// /help
// =====================
bot.help((ctx) => {
  ctx.reply(
    `ðŸ“– *á€¡á€žá€¯á€¶á€¸á€•á€¼á€¯á€”á€Šá€ºá€¸:*\n\n` +
    `*1. Wallet á€‘á€Šá€·á€º:*\n` +
    `\`/addwallet wallet1 PRIVATE_KEY\`\n\n` +
    `*2. Wallets á€™á€»á€¬á€¸á€…á€½á€¬á€‘á€Šá€·á€º:*\n` +
    `\`/addwallet wallet2 PRIVATE_KEY_2\`\n` +
    `\`/addwallet wallet3 PRIVATE_KEY_3\`\n\n` +
    `*3. Active wallet á€›á€½á€±á€¸:*\n` +
    `\`/usewallet wallet1\`\n\n` +
    `*4. Contract setup:*\n` +
    `\`/setcontract 0xADDRESS\`\n` +
    `\`/setabi [...ABI JSON]\`\n\n` +
    `*5. Mint á€á€…á€ºá€á€¯á€á€Šá€ºá€¸:*\n` +
    `\`/mint 1 0.08\` â€” active wallet\n\n` +
    `*6. Mint á€¡á€¬á€¸á€œá€¯á€¶á€¸:*\n` +
    `\`/mintall 1 0.08\` â€” wallets á€¡á€¬á€¸á€œá€¯á€¶á€¸\n\n` +
    `ðŸ”’ Messages auto-deleted for security`,
    { parse_mode: "Markdown" }
  );
});

// =====================
// /addwallet [label] [privateKey]
// =====================
bot.command("addwallet", (ctx) => {
  const session = getSession(ctx.from.id);
  const args = ctx.message.text.split(" ").slice(1);

  if (args.length < 2) {
    return ctx.reply(
      `âž• *Wallet á€‘á€Šá€·á€ºá€”á€Šá€ºá€¸:*\n\n` +
      `\`/addwallet LABEL PRIVATE_KEY\`\n\n` +
      `á€¥á€•á€™á€¬:\n` +
      `\`/addwallet wallet1 abc123...def\`\n` +
      `\`/addwallet mywallet 0xabc123...def\`\n\n` +
      `âš ï¸ Message á€•á€­á€¯á€·á€•á€¼á€®á€¸ auto-delete á€–á€¼á€…á€ºá€™á€Šá€º`,
      { parse_mode: "Markdown" }
    );
  }

  const label = args[0].trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  const rawKey = args[1].trim().replace(/^0x/, "");

  if (!label) {
    return ctx.reply(`âŒ Label á€™á€™á€¾á€”á€ºá€•á€«! Letters, numbers, underscore á€žá€¬á€žá€¯á€¶á€¸á€”á€­á€¯á€„á€ºá€žá€Šá€º`);
  }

  ctx.deleteMessage(ctx.message.message_id).catch(() => {});

  try {
    const wallet = new ethers.Wallet("0x" + rawKey);

    // Label á€‘á€•á€ºá€”á€±á€›á€„á€º overwrite
    const isUpdate = session.wallets.has(label);
    session.wallets.set(label, { privateKey: "0x" + rawKey, wallet });

    // á€•á€‘á€™á€†á€¯á€¶á€¸ wallet á€†á€­á€¯á€›á€„á€º auto-activate
    if (!session.activeWallet || session.wallets.size === 1) {
      session.activeWallet = label;
    }

    const activeTag = session.activeWallet === label ? " âœ… (active)" : "";
    ctx.reply(
      `${isUpdate ? "ðŸ”„ Updated" : "âœ… Added"} *Wallet: ${label}*${activeTag}\n\n` +
      `ðŸ“ \`${wallet.address}\`\n` +
      `ðŸ’¼ Total wallets: ${session.wallets.size}\n\n` +
      `${session.wallets.size === 1 ? "â„¹ï¸ Auto-selected as active wallet" : `Active: *${session.activeWallet}*`}\n` +
      `ðŸ“‹ /wallets â€” list all`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    ctx.reply(`âŒ Private key á€™á€™á€¾á€”á€ºá€•á€«!\n64 character hex string á€–á€¼á€…á€ºá€›á€™á€Šá€º`);
  }
});

// =====================
// /wallets â€” list all wallets
// =====================
bot.command("wallets", async (ctx) => {
  const session = getSession(ctx.from.id);

  if (session.wallets.size === 0) {
    return ctx.reply(
      `ðŸ’¼ *Wallets á€™á€›á€¾á€­á€žá€±á€¸*\n\n/addwallet á€”á€²á€· wallet á€‘á€Šá€·á€ºá€•á€«`,
      { parse_mode: "Markdown" }
    );
  }

  const loadMsg = await ctx.reply("â³ Balances á€…á€…á€ºá€”á€±á€žá€Šá€º...");

  try {
    const provider = new ethers.JsonRpcProvider(session.rpcUrl);
    const lines = [];

    for (const [label, { wallet }] of session.wallets) {
      const isActive = label === session.activeWallet;
      try {
        const balance = await provider.getBalance(wallet.address);
        const eth = parseFloat(ethers.formatEther(balance)).toFixed(4);
        lines.push(
          `${isActive ? "âœ…" : "â¬œ"} *${label}*\n` +
          `   ðŸ“ \`${shortAddr(wallet.address)}\`\n` +
          `   ðŸ’° ${eth} ETH`
        );
      } catch {
        lines.push(
          `${isActive ? "âœ…" : "â¬œ"} *${label}*\n` +
          `   ðŸ“ \`${shortAddr(wallet.address)}\`\n` +
          `   ðŸ’° Balance á€›á€šá€°áá€™á€›á€•á€«`
        );
      }
    }

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      loadMsg.message_id,
      null,
      `ðŸ’¼ *Wallets (${session.wallets.size})*\n\n` +
      lines.join("\n\n") + "\n\n" +
      `âœ… = active wallet\n` +
      `\`/usewallet LABEL\` â€” á€•á€¼á€±á€¬á€„á€ºá€¸á€›á€”á€º`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, loadMsg.message_id, null,
      `âŒ Error: ${e.message}`
    );
  }
});

// =====================
// /usewallet [label] â€” active wallet á€›á€½á€±á€¸
// =====================
bot.command("usewallet", (ctx) => {
  const session = getSession(ctx.from.id);
  const args = ctx.message.text.split(" ").slice(1);

  if (args.length === 0) {
    if (session.wallets.size === 0) {
      return ctx.reply(`âŒ Wallets á€™á€›á€¾á€­á€žá€±á€¸! /addwallet á€”á€²á€· á€‘á€Šá€·á€ºá€•á€«`);
    }
    const list = [...session.wallets.keys()]
      .map((l) => `â€¢ \`/usewallet ${l}\`${l === session.activeWallet ? " âœ…" : ""}`)
      .join("\n");
    return ctx.reply(
      `âœ… *Active Wallet á€›á€½á€±á€¸á€•á€«:*\n\n${list}`,
      { parse_mode: "Markdown" }
    );
  }

  const label = args[0].trim().toLowerCase();
  if (!session.wallets.has(label)) {
    const available = [...session.wallets.keys()].join(", ");
    return ctx.reply(
      `âŒ Wallet "${label}" á€™á€á€½á€±á€·á€•á€«\n\ná€›á€¾á€­á€žá€±á€¬wallet: ${available || "none"}`
    );
  }

  session.activeWallet = label;
  const { wallet } = session.wallets.get(label);
  ctx.reply(
    `âœ… *Active Wallet: ${label}*\n\nðŸ“ \`${wallet.address}\``,
    { parse_mode: "Markdown" }
  );
});

// =====================
// /removewallet [label]
// =====================
bot.command("removewallet", (ctx) => {
  const session = getSession(ctx.from.id);
  const args = ctx.message.text.split(" ").slice(1);

  if (!args[0]) {
    return ctx.reply(`\`/removewallet LABEL\` â€” wallet á€–á€»á€€á€ºá€›á€”á€º`, { parse_mode: "Markdown" });
  }

  const label = args[0].trim().toLowerCase();
  if (!session.wallets.has(label)) {
    return ctx.reply(`âŒ Wallet "${label}" á€™á€á€½á€±á€·á€•á€«`);
  }

  session.wallets.delete(label);

  // Active wallet á€–á€»á€€á€ºá€á€²á€·á€›á€„á€º á€”á€±á€¬á€€á€ºá€á€…á€ºá€á€¯á€žá€­á€¯á€· á€•á€¼á€±á€¬á€„á€ºá€¸
  if (session.activeWallet === label) {
    session.activeWallet = session.wallets.size > 0
      ? session.wallets.keys().next().value
      : null;
  }

  ctx.reply(
    `ðŸ—‘ï¸ Wallet *${label}* á€–á€»á€€á€ºá€•á€¼á€®á€¸\n` +
    `Remaining: ${session.wallets.size}\n` +
    (session.activeWallet ? `Active: *${session.activeWallet}*` : "Active wallet á€™á€›á€¾á€­á€á€±á€¬á€·"),
    { parse_mode: "Markdown" }
  );
});

// =====================
// /clearwallets â€” á€¡á€¬á€¸á€œá€¯á€¶á€¸á€–á€»á€€á€º
// =====================
bot.command("clearwallets", (ctx) => {
  const session = getSession(ctx.from.id);
  session.wallets.clear();
  session.activeWallet = null;
  ctx.reply(`ðŸ—‘ï¸ *Wallets á€¡á€¬á€¸á€œá€¯á€¶á€¸ á€–á€»á€€á€ºá€•á€¼á€®á€¸!*\n\n/addwallet á€”á€²á€· á€•á€¼á€”á€ºá€‘á€Šá€·á€ºá€”á€­á€¯á€„á€ºá€žá€Šá€º`, {
    parse_mode: "Markdown",
  });
});

// =====================
// /setcontract
// =====================
bot.command("setcontract", (ctx) => {
  const session = getSession(ctx.from.id);
  const args = ctx.message.text.split(" ").slice(1);

  if (!args[0]) {
    return ctx.reply(`ðŸ“„ Format: \`/setcontract 0xADDRESS\``, { parse_mode: "Markdown" });
  }

  const addr = args[0].trim();
  if (!ethers.isAddress(addr)) {
    return ctx.reply(`âŒ á€™á€™á€¾á€”á€ºá€žá€±á€¬ Contract Address!`);
  }

  session.contractAddress = addr;
  ctx.reply(
    `âœ… *Contract Address á€žá€á€ºá€™á€¾á€á€ºá€•á€¼á€®á€¸!*\n\n\`${addr}\`\n\ná€”á€±á€¬á€€á€ºá€á€…á€ºá€†á€„á€·á€º: /setabi`,
    { parse_mode: "Markdown" }
  );
});

// =====================
// /setabi
// =====================
bot.command("setabi", (ctx) => {
  const session = getSession(ctx.from.id);
  const text = ctx.message.text.replace("/setabi", "").trim();

  if (!text) {
    return ctx.reply(
      `âš™ï¸ Format: \`/setabi [JSON ABI]\`\n\nmint function á€•á€«á€žá€±á€¬ ABI á€‘á€Šá€·á€ºá€•á€«`,
      { parse_mode: "Markdown" }
    );
  }

  try {
    const abi = JSON.parse(text);
    if (!Array.isArray(abi)) throw new Error("Array á€–á€¼á€…á€ºá€›á€™á€Šá€º");

    const mintFns = abi.filter((fn) => fn.name?.toLowerCase().includes("mint"));
    if (mintFns.length === 0) {
      return ctx.reply(`âš ï¸ ABI á€™á€¾á€¬ mint function á€™á€á€½á€±á€·á€•á€«`);
    }

    session.abi = abi;
    const fnList = mintFns
      .map((fn) => `â€¢ \`${fn.name}(${fn.inputs?.map((i) => i.type).join(", ")})\``)
      .join("\n");

    ctx.reply(
      `âœ… *ABI á€žá€á€ºá€™á€¾á€á€ºá€•á€¼á€®á€¸!*\n\nMint Functions:\n${fnList}\n\n/mint á€žá€­á€¯á€·á€™á€Ÿá€¯á€á€º /mintall á€”á€²á€· mint á€œá€¯á€•á€ºá€”á€­á€¯á€„á€ºá€•á€¼á€®!`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    ctx.reply(`âŒ ABI JSON á€™á€™á€¾á€”á€ºá€•á€«!\nError: ${e.message}`);
  }
});

// =====================
// Core mint function (single wallet)
// =====================
async function mintWithWallet({ wallet, contractAddress, abi, rpcUrl, quantity, valueEth }) {
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = wallet.connect(provider);
  const contract = new ethers.Contract(contractAddress, abi, signer);

  const mintFns = abi.filter(
    (fn) => fn.name?.toLowerCase().includes("mint") && fn.type === "function"
  );
  if (mintFns.length === 0) throw new Error("Mint function á€™á€á€½á€±á€·á€•á€«");

  const mintFn = mintFns[0];
  const txOptions = {
    value: ethers.parseEther(valueEth),
    gasLimit: 300000,
  };

  const paramCount = mintFn.inputs?.length || 0;
  let tx;
  if (paramCount === 0) {
    tx = await contract[mintFn.name](txOptions);
  } else if (paramCount === 1) {
    tx = await contract[mintFn.name](quantity, txOptions);
  } else {
    throw new Error(`${mintFn.name} á€™á€¾á€¬ parameters ${paramCount} á€á€¯á€•á€«á€žá€Šá€º â€” manual input á€œá€­á€¯á€žá€Šá€º`);
  }

  const receipt = await tx.wait();
  return { tx, receipt };
}

// =====================
// /mint [qty] [ethPrice] â€” active wallet
// =====================
bot.command("mint", async (ctx) => {
  const session = getSession(ctx.from.id);
  const active = getActiveWallet(session);

  if (!active) {
    return ctx.reply(`âŒ Active wallet á€™á€›á€¾á€­á€•á€«!\n/addwallet á€”á€²á€· á€‘á€Šá€·á€ºá€•á€¼á€®á€¸ /usewallet á€”á€²á€· á€›á€½á€±á€¸á€•á€«`);
  }
  if (!session.contractAddress) return ctx.reply(`âŒ /setcontract á€”á€²á€· contract á€‘á€Šá€·á€ºá€•á€«`);
  if (!session.abi) return ctx.reply(`âŒ /setabi á€”á€²á€· ABI á€‘á€Šá€·á€ºá€•á€«`);

  const args = ctx.message.text.split(" ").slice(1);
  const quantity = parseInt(args[0]) || 1;
  const valueEth = args[1] || "0";

  const statusMsg = await ctx.reply(
    `â³ *Minting...*\n\nWallet: *${session.activeWallet}*\n` +
    `ðŸ“ \`${shortAddr(active.wallet.address)}\`\n` +
    `Qty: ${quantity} | Price: ${valueEth} ETH`,
    { parse_mode: "Markdown" }
  );

  try {
    const { tx, receipt } = await mintWithWallet({
      wallet: active.wallet,
      contractAddress: session.contractAddress,
      abi: session.abi,
      rpcUrl: session.rpcUrl,
      quantity,
      valueEth,
    });

    await ctx.telegram.editMessageText(
      ctx.chat.id, statusMsg.message_id, null,
      `âœ… *Mint á€¡á€±á€¬á€„á€ºá€™á€¼á€„á€º!* ðŸŽ‰\n\n` +
      `Wallet: *${session.activeWallet}*\n` +
      `ðŸ“‹ TX: \`${tx.hash}\`\n` +
      `â›½ Gas: ${receipt.gasUsed.toString()}\n` +
      `ðŸ“¦ Block: ${receipt.blockNumber}\n` +
      `ðŸ”— [Etherscan](https://etherscan.io/tx/${tx.hash})`,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );
  } catch (err) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, statusMsg.message_id, null,
      `âŒ *Mint á€™á€¡á€±á€¬á€„á€ºá€™á€¼á€„á€ºá€•á€«!*\n\nWallet: ${session.activeWallet}\nError: ${err.reason || err.message}`,
      { parse_mode: "Markdown" }
    );
  }
});

// =====================
// /mintall [qty] [ethPrice] â€” wallets á€¡á€¬á€¸á€œá€¯á€¶á€¸
// =====================
bot.command("mintall", async (ctx) => {
  const session = getSession(ctx.from.id);

  if (session.wallets.size === 0) {
    return ctx.reply(`âŒ Wallets á€™á€›á€¾á€­á€•á€«! /addwallet á€”á€²á€· á€‘á€Šá€·á€ºá€•á€«`);
  }
  if (!session.contractAddress) return ctx.reply(`âŒ /setcontract á€”á€²á€· contract á€‘á€Šá€·á€ºá€•á€«`);
  if (!session.abi) return ctx.reply(`âŒ /setabi á€”á€²á€· ABI á€‘á€Šá€·á€ºá€•á€«`);

  const args = ctx.message.text.split(" ").slice(1);
  const quantity = parseInt(args[0]) || 1;
  const valueEth = args[1] || "0";
  const totalWallets = session.wallets.size;

  const statusMsg = await ctx.reply(
    `ðŸš€ *Mint All Starting...*\n\n` +
    `ðŸ’¼ Wallets: ${totalWallets}\n` +
    `Qty each: ${quantity} | Price: ${valueEth} ETH\n` +
    `Total ETH: ~${(parseFloat(valueEth) * totalWallets).toFixed(4)} ETH\n\n` +
    `â³ Processing...`,
    { parse_mode: "Markdown" }
  );

  const results = [];
  let successCount = 0;
  let failCount = 0;

  for (const [label, { wallet }] of session.wallets) {
    try {
      // Update progress
      await ctx.telegram.editMessageText(
        ctx.chat.id, statusMsg.message_id, null,
        `ðŸš€ *Mint All In Progress...*\n\n` +
        `â³ Processing: *${label}*\n` +
        `âœ… Done: ${successCount} | âŒ Failed: ${failCount} | â³ Remaining: ${totalWallets - successCount - failCount}`,
        { parse_mode: "Markdown" }
      );

      const { tx, receipt } = await mintWithWallet({
        wallet,
        contractAddress: session.contractAddress,
        abi: session.abi,
        rpcUrl: session.rpcUrl,
        quantity,
        valueEth,
      });

      successCount++;
      results.push(
        `âœ… *${label}*\n` +
        `   \`${shortAddr(wallet.address)}\`\n` +
        `   TX: [${tx.hash.slice(0, 10)}...](https://etherscan.io/tx/${tx.hash})\n` +
        `   Gas: ${receipt.gasUsed.toString()}`
      );
    } catch (err) {
      failCount++;
      results.push(
        `âŒ *${label}*\n` +
        `   \`${shortAddr(wallet.address)}\`\n` +
        `   Error: ${(err.reason || err.message || "unknown").slice(0, 60)}`
      );
    }
  }

  // Final summary
  const summary =
    `ðŸŽ¯ *Mint All Complete!*\n\n` +
    `âœ… Success: ${successCount}/${totalWallets}\n` +
    `âŒ Failed: ${failCount}/${totalWallets}\n\n` +
    results.join("\n\n");

  // Telegram á€™á€¾á€¬ message 4096 char limit á€›á€¾á€­á€žá€±á€¬á€€á€¼á€±á€¬á€„á€·á€º split
  if (summary.length > 4000) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, statusMsg.message_id, null,
      `ðŸŽ¯ *Mint All Complete!*\n\nâœ… Success: ${successCount} | âŒ Failed: ${failCount}\n\nDetailed results below:`,
      { parse_mode: "Markdown" }
    );
    // Chunk results
    let chunk = "";
    for (const r of results) {
      if ((chunk + r).length > 3800) {
        await ctx.reply(chunk, { parse_mode: "Markdown", disable_web_page_preview: true });
        chunk = r + "\n\n";
      } else {
        chunk += r + "\n\n";
      }
    }
    if (chunk) await ctx.reply(chunk, { parse_mode: "Markdown", disable_web_page_preview: true });
  } else {
    await ctx.telegram.editMessageText(
      ctx.chat.id, statusMsg.message_id, null,
      summary,
      { parse_mode: "Markdown", disable_web_page_preview: true }
    );
  }
});

// =====================
// /status
// =====================
bot.command("status", async (ctx) => {
  const session = getSession(ctx.from.id);
  const loadMsg = await ctx.reply("â³ Loading...");

  try {
    const provider = new ethers.JsonRpcProvider(session.rpcUrl);

    // Active wallet balance
    let walletInfo = `ðŸ’¼ Wallets: ${session.wallets.size}\nActive: ${session.activeWallet || "none"}\n`;
    if (session.activeWallet && session.wallets.has(session.activeWallet)) {
      const { wallet } = session.wallets.get(session.activeWallet);
      const bal = await provider.getBalance(wallet.address);
      walletInfo += `ðŸ“ \`${wallet.address}\`\nðŸ’° ${parseFloat(ethers.formatEther(bal)).toFixed(6)} ETH`;
    }

    const contractInfo = session.contractAddress
      ? `âœ… \`${session.contractAddress}\``
      : "âŒ á€™á€žá€á€ºá€™á€¾á€á€ºá€›á€žá€±á€¸";

    const abiInfo = session.abi
      ? `âœ… Loaded (${session.abi.filter((f) => f.name?.toLowerCase().includes("mint")).map((f) => f.name).join(", ")})`
      : "âŒ á€™á€‘á€Šá€·á€ºá€›á€žá€±á€¸";

    await ctx.telegram.editMessageText(
      ctx.chat.id, loadMsg.message_id, null,
      `ðŸ“Š *Bot Status*\n\n` +
      `ðŸ”‘ *Wallets:*\n${walletInfo}\n\n` +
      `ðŸ“„ *Contract:*\n${contractInfo}\n\n` +
      `âš™ï¸ *ABI:*\n${abiInfo}\n\n` +
      `ðŸŒ RPC: ${session.rpcUrl.slice(0, 40)}...\n\n` +
      `ðŸ“‹ /wallets â€” full wallet list`,
      { parse_mode: "Markdown" }
    );
  } catch (e) {
    await ctx.telegram.editMessageText(
      ctx.chat.id, loadMsg.message_id, null,
      `âŒ Status á€›á€šá€°áá€™á€›á€•á€«\n${e.message}`
    );
  }
});

// =====================
// /setrpc
// =====================
bot.command("setrpc", (ctx) => {
  const session = getSession(ctx.from.id);
  const args = ctx.message.text.split(" ").slice(1);

  if (!args[0]) {
    return ctx.reply(
      `ðŸŒ Format: \`/setrpc https://your-rpc-url\`\n\n` +
      `Free RPCs:\n` +
      `â€¢ https://eth.llamarpc.com\n` +
      `â€¢ https://eth-mainnet.g.alchemy.com/v2/KEY\n` +
      `â€¢ https://mainnet.base.org`,
      { parse_mode: "Markdown" }
    );
  }

  session.rpcUrl = args[0].trim();
  ctx.reply(`âœ… RPC URL á€•á€¼á€±á€¬á€„á€ºá€¸á€•á€¼á€®á€¸!\n\`${session.rpcUrl}\``, { parse_mode: "Markdown" });
});

// =====================
// Error handling
// =====================
bot.catch((err, ctx) => {
  console.error(`Error [${ctx.updateType}]:`, err);
  ctx.reply("âš ï¸ á€á€…á€ºá€á€¯á€á€¯ á€–á€¼á€…á€ºá€žá€½á€¬á€¸á€žá€Šá€º! á€”á€±á€¬á€€á€ºá€á€…á€ºá€€á€¼á€­á€™á€º á€€á€¼á€­á€¯á€¸á€…á€¬á€¸á€•á€«").catch(() => {});
});

bot.launch();
console.log("ðŸ¤– NFT WL Mint Bot (Multi-Wallet) started!");

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
