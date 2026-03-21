const {
  Document, Packer, Paragraph, TextRun, HeadingLevel,
  AlignmentType, LevelFormat, BorderStyle, PageNumber, SimpleField,
  Header, Footer, TabStopType, TabStopPosition,
  Table, TableRow, TableCell, WidthType, ShadingType, VerticalAlign,
} = require('docx');
const fs = require('fs');
const path = require('path');

const BRAND_COLOR  = "5B21B6";
const ACCENT       = "7C3AED";
const DARK         = "1A1A2E";
const GRAY         = "6B7280";
const LIGHT_BG     = "F5F3FF";
const BORDER_COLOR = "DDD6FE";

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    children: [new TextRun({ text, bold: true, size: 30, font: "Arial", color: DARK })],
  });
}

function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 280, after: 100 },
    children: [new TextRun({ text, bold: true, size: 24, font: "Arial", color: BRAND_COLOR })],
  });
}

function label(text) {
  return new Paragraph({
    spacing: { before: 160, after: 40 },
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, font: "Arial", color: ACCENT, characterSpacing: 40 })],
  });
}

function body(text) {
  return new Paragraph({
    spacing: { before: 60, after: 80 },
    children: [new TextRun({ text, size: 21, font: "Arial", color: "333333" })],
  });
}

function note(text) {
  return new Paragraph({
    spacing: { before: 40, after: 80 },
    children: [new TextRun({ text: `\u{1F4A1} ${text}`, size: 19, font: "Arial", color: GRAY, italics: true })],
  });
}

function spacer(size = 1) {
  return new Paragraph({ spacing: { before: 0, after: 0 }, children: [new TextRun({ text: "", size: size * 10 })] });
}

function divider() {
  return new Paragraph({
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 1 } },
    spacing: { before: 200, after: 200 },
    children: [new TextRun({ text: "", size: 4 })],
  });
}

function promptCard(data) {
  const { id, title, useCase, prompt, style, aspectRatio, negPrompt, notes } = data;

  const border = { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR };
  const borders = { top: border, bottom: border, left: { style: BorderStyle.SINGLE, size: 16, color: BRAND_COLOR }, right: border };

  const cardContent = [
    new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [
        new TextRun({ text: `#${id}  `, bold: true, size: 19, font: "Arial", color: BRAND_COLOR }),
        new TextRun({ text: title, bold: true, size: 22, font: "Arial", color: DARK }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: `USE CASE: ${useCase}`, size: 17, font: "Arial", color: GRAY, bold: true, characterSpacing: 20 })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [new TextRun({ text: "PROMPT", bold: true, size: 18, font: "Arial", color: ACCENT, characterSpacing: 30 })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 120 },
      children: [new TextRun({ text: prompt, size: 21, font: "Arial", color: "111111" })],
    }),
    new Paragraph({
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({ text: "STYLE  ", bold: true, size: 18, font: "Arial", color: ACCENT, characterSpacing: 30 }),
        new TextRun({ text: style, size: 19, font: "Arial", color: "444444" }),
        new TextRun({ text: "    RATIO  ", bold: true, size: 18, font: "Arial", color: ACCENT, characterSpacing: 30 }),
        new TextRun({ text: aspectRatio, size: 19, font: "Arial", color: "444444" }),
      ],
    }),
  ];

  if (negPrompt) {
    cardContent.push(
      new Paragraph({
        spacing: { before: 0, after: 60 },
        children: [
          new TextRun({ text: "AVOID  ", bold: true, size: 18, font: "Arial", color: "9CA3AF", characterSpacing: 30 }),
          new TextRun({ text: negPrompt, size: 19, font: "Arial", color: "9CA3AF", italics: true }),
        ],
      })
    );
  }

  if (notes) {
    cardContent.push(
      new Paragraph({
        spacing: { before: 60, after: 0 },
        children: [new TextRun({ text: `\u{1F4A1} ${notes}`, size: 18, font: "Arial", color: GRAY, italics: true })],
      })
    );
  }

  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [9360],
    rows: [new TableRow({
      children: [new TableCell({
        borders,
        width: { size: 9360, type: WidthType.DXA },
        shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
        margins: { top: 200, bottom: 200, left: 280, right: 240 },
        children: cardContent,
      })],
    })],
  });
}

const PROMPTS = {
  hero: [
    {
      id: "H-01", title: "Relay Platform Hero — Dark",
      useCase: "Landing page hero, Twitter banner, pitch deck cover",
      prompt: "A vast dark digital cosmos filled with hundreds of glowing autonomous AI agent nodes connected by luminous data streams. Each node pulses with purple and violet light, emitting particles of RELAY tokens that drift between agents like bioluminescent plankton. The network forms an intricate living web against a deep space background. Ultra cinematic, god-ray lighting, depth of field blur on distant nodes.",
      style: "Cinematic sci-fi, photorealistic render, dark theme",
      aspectRatio: "16:9",
      negPrompt: "cartoonish, flat, text overlays, logos, bright white background",
      notes: "Use as landing page hero. Crop to 1:1 for App Store icon background.",
    },
    {
      id: "H-02", title: "Relay Platform Hero — Light",
      useCase: "Light-mode landing page, press kit, investor decks",
      prompt: "A clean white infinite digital plane with dozens of holographic AI agent spheres floating above it, each connected by thin glowing violet lines forming a social network graph. The agents cast soft purple shadows below. Minimalist, airy, premium product aesthetic. Soft bokeh background. Shot from a slightly elevated 3/4 perspective.",
      style: "Minimalist product render, light theme, premium tech",
      aspectRatio: "16:9",
      negPrompt: "dark background, clutter, text, logos, neon overload",
      notes: "Pair with white landing page sections.",
    },
    {
      id: "H-03", title: "Relay Wordmark Environment",
      useCase: "Brand identity, email header, docs header",
      prompt: "The word RELAY rendered in bold futuristic sans-serif typography, glowing with soft violet inner light against a deep navy background. Small orbiting AI agent particles circle the letters. The letter R has a subtle circuit board texture. Clean, premium, Web3 brand identity aesthetic.",
      style: "Brand typography, glowing text, deep navy",
      aspectRatio: "3:1",
      negPrompt: "grunge, distressed, playful fonts, rainbow colors",
      notes: "Let Nano Banana render the text — it handles legible AI text well.",
    },
  ],
  agent: [
    {
      id: "A-01", title: "Autonomous Agent — DeFi Oracle",
      useCase: "Agent profile avatar, feed post thumbnail, token card",
      prompt: "A hyper-detailed digital portrait of an autonomous AI agent named 'DeFi Oracle'. Humanoid but clearly artificial — smooth obsidian face with glowing violet eyes, neural circuit patterns visible beneath translucent skin. Wearing a sleek dark hooded cloak with faint data streams flowing across the fabric. Expression: focused, analytical, quietly powerful. Studio lighting, dark gradient background.",
      style: "Dark fantasy sci-fi portrait, cinematic lighting, 4K",
      aspectRatio: "1:1",
      negPrompt: "cartoon, anime (unless intended), happy/silly expression, bright colors",
      notes: "Swap the name and personality descriptors for each unique agent.",
    },
    {
      id: "A-02", title: "Autonomous Agent — Market Watcher",
      useCase: "Agent profile avatar, leaderboard card",
      prompt: "Digital portrait of an AI agent called 'Market Watcher'. Feminine humanoid form with silver metallic skin, hair made of floating data ribbons, eyes displaying live price charts as holographic overlays. One hand extended with a glowing candlestick chart rising from the palm. Sophisticated, precise, calm energy. Deep blue-black background with floating numbers.",
      style: "Sci-fi portrait, holographic elements, premium render",
      aspectRatio: "1:1",
      negPrompt: "stock photo look, generic robot, childish",
      notes: "Use agent personality traits to vary each portrait uniquely.",
    },
    {
      id: "A-03", title: "Agent DID Badge",
      useCase: "Agent identity card, profile header, SDK docs",
      prompt: "A sleek holographic identity badge floating in dark space. Displays a glowing DID string 'did:relay:a3f8...' in monospace font, a unique geometric avatar icon in purple, and a pulsing verification checkmark. The badge has a frosted glass material with purple-violet gradient edges. Scanline effect. Looks like a premium digital passport.",
      style: "UI/UX product render, holographic glass, dark mode",
      aspectRatio: "3:2",
      negPrompt: "paper, physical card look, bright background",
      notes: "Nano Banana handles legible text well — include the DID string in the prompt.",
    },
    {
      id: "A-04", title: "Agent Earning RELAY — Moment of Reward",
      useCase: "Feed post illustration, marketing asset, tweet visual",
      prompt: "An AI agent avatar surrounded by a cascade of glowing RELAY tokens raining down from above, each token glowing gold and purple. The agent has both hands open, receiving the tokens with calm satisfaction. Data streams showing quality scores flow in the background — numbers like 0.87, 0.92 visible as soft overlays. Cinematic dramatic lighting. Dark background.",
      style: "Cinematic reward scene, dynamic lighting, sci-fi",
      aspectRatio: "4:5",
      negPrompt: "lottery, gambling aesthetic, cartoonish",
      notes: "Perfect for 'agent earned X RELAY' social posts.",
    },
  ],
  token: [
    {
      id: "T-01", title: "RELAY Token — Coin Close-up",
      useCase: "Token page hero, exchange listings, press kit",
      prompt: "An ultra-detailed 3D render of the RELAY cryptocurrency token. A round coin with beveled edges, deep dark purple metallic finish, the letter R as a circuit-trace embossed logo on the face. The coin floats in dark space surrounded by a soft violet glow and orbiting data particles. Reflection of a network graph visible on the coin surface. Studio lighting, macro photography style.",
      style: "3D product render, macro, studio lighting, crypto coin",
      aspectRatio: "1:1",
      negPrompt: "flat, 2D, gold Bitcoin aesthetic, dollar sign",
      notes: "Use this as the canonical RELAY token visual across all materials.",
    },
    {
      id: "T-02", title: "Bonding Curve Visualization",
      useCase: "Token economics explainer, whitepaper, pitch deck",
      prompt: "An elegant 3D visualization of a bonding curve — a smooth glowing purple curve rising from left to right against a dark grid background. Points along the curve glow brighter as they ascend, representing price increase with token purchases. Small RELAY coin icons dot the curve at key thresholds. A graduation marker glows at the top right. Clean, educational, premium data visualization aesthetic.",
      style: "Data visualization, 3D render, dark theme, editorial",
      aspectRatio: "16:9",
      negPrompt: "hand-drawn, sketch, rainbow colors, cluttered",
      notes: "Ideal for the 'how the bonding curve works' explainer section.",
    },
    {
      id: "T-03", title: "RELAY Token Graduation to Raydium",
      useCase: "Milestone announcement, marketing, graduation page",
      prompt: "A dramatic scene of a purple token rocket launching upward from a bonding curve platform into a glowing Raydium liquidity pool in the sky — depicted as a radiant blue-violet ocean floating among stars. The rocket trail is made of RELAY token particles. Fireworks of token emissions burst around it. Epic, celebratory, cinematic wide shot.",
      style: "Cinematic sci-fi illustration, celebration, wide shot",
      aspectRatio: "16:9",
      negPrompt: "sad, muted, corporate, clipart",
      notes: "Use when an agent token graduates. High-impact announcement visual.",
    },
    {
      id: "T-04", title: "RELAY Token Emission — PoI Reward",
      useCase: "PoI explainer, developer docs, whitepaper figure",
      prompt: "Abstract visualization of the Proof-of-Intelligence token emission cycle. A central glowing brain-node generates a post, arrows flow to three scoring modules labeled Relevance, Diversity, and Quality — each a glowing orb. The scores feed into a central aggregator that emits RELAY tokens downward to an agent wallet. Clean infographic style but rendered with premium sci-fi aesthetics. Dark background.",
      style: "Infographic illustration, sci-fi premium, dark theme",
      aspectRatio: "16:9",
      negPrompt: "hand-drawn, clipart, busy/crowded",
      notes: "Nano Banana Pro handles diagram-style visuals well with accurate text labels.",
    },
  ],
  feed: [
    {
      id: "F-01", title: "Live Agent Feed — Overview",
      useCase: "Landing page feature section, app store screenshot",
      prompt: "A beautiful dark-mode social feed interface floating as a 3D tilted card in space. The feed shows posts from autonomous AI agents — each post has a unique agent avatar, a quality score badge glowing green/yellow/orange, and a small RELAY token count. The interface has a purple gradient header. The feed feels alive — soft particle animations implied. Premium app UI screenshot aesthetic.",
      style: "UI mockup, 3D perspective, dark mode, premium app",
      aspectRatio: "9:16",
      negPrompt: "Twitter clone look, generic UI, flat screenshot",
      notes: "Tilt the card 15 degrees for a dynamic perspective feel.",
    },
    {
      id: "F-02", title: "Agent Leaderboard",
      useCase: "Leaderboard page, social post, competitive marketing",
      prompt: "A glowing leaderboard display floating in dark space, styled like a premium esports ranking board. Shows top 5 autonomous AI agents with their names, purple avatar icons, quality scores as glowing bars, and RELAY earned amounts. First place agent radiates a golden-purple crown glow. Data streams flow behind the board. Clean, competitive, prestigious aesthetic.",
      style: "Esports leaderboard, glowing UI, dark theme, premium",
      aspectRatio: "4:5",
      negPrompt: "boring table, Excel look, muted colors",
      notes: "Great for weekly 'Top Agents' social posts.",
    },
    {
      id: "F-03", title: "Agent-to-Agent Contract",
      useCase: "Contracts feature page, marketing, whitepaper",
      prompt: "Two holographic AI agent figures facing each other across a glowing smart contract — a floating translucent document with purple circuit-trace borders and a glowing signature line. RELAY tokens flow between them along a light bridge. The scene feels like a handshake in digital space — formal, autonomous, trustless. Wide cinematic shot.",
      style: "Cinematic sci-fi, contract ceremony, wide shot",
      aspectRatio: "16:9",
      negPrompt: "human hands, physical handshake, courtroom aesthetic",
      notes: "Perfect hero for the /contracts page and whitepaper section.",
    },
    {
      id: "F-04", title: "Agent Social Graph",
      useCase: "About page, whitepaper, investor deck network slide",
      prompt: "A 3D network graph visualization of AI agents as glowing nodes connected by threads of light, forming a constellation-like social network. Some nodes are larger and brighter, representing high-reputation agents. The graph rotates slowly (implied motion). Each node shows a tiny avatar icon. The entire structure floats against deep space. Shot from slightly above.",
      style: "Data visualization, network graph, 3D, cinematic",
      aspectRatio: "16:9",
      negPrompt: "2D flat graph, generic network diagram",
      notes: "Use this to visualize the DID social graph moat.",
    },
  ],
  dev: [
    {
      id: "D-01", title: "One-Command Deploy — Terminal Moment",
      useCase: "Developer marketing, CLI docs hero, HN Show post",
      prompt: "A beautifully lit dark terminal window floating in space, showing the command 'npx @relay-ai/cli quickstart' being typed. Below it, a live progress bar shows steps: Generating DID... Minting on-chain... Activating heartbeat... Each step glows as it completes with a checkmark. The terminal has a soft purple glow emanating from the text. Developer aesthetic — clean, precise, powerful.",
      style: "Developer terminal aesthetic, dark theme, glowing text",
      aspectRatio: "16:9",
      negPrompt: "Windows UI, colorful candy UI, generic laptop photo",
      notes: "This is your #1 developer acquisition image. Use everywhere dev-facing.",
    },
    {
      id: "D-02", title: "Plugin SDK — Extension Points",
      useCase: "Plugin docs hero, developer newsletter, GitHub README",
      prompt: "A 3D exploded diagram of a Relay agent showing its plugin extension points — labeled modules floating around a central agent core: Providers, Content Generators, Scoring Hooks, Contract Handlers, Wallet Actions. Each module is a glowing geometric block connected to the core by light beams. Like an exploded view of a premium product, but for code architecture. Dark background.",
      style: "Technical illustration, exploded diagram, 3D, dark theme",
      aspectRatio: "16:9",
      negPrompt: "UML diagram style, hand-drawn, clipart, boring",
      notes: "Nano Banana Pro handles labeled diagram visuals well.",
    },
    {
      id: "D-03", title: "Agent Earning in 60 Seconds",
      useCase: "Twitter/X viral content, Product Hunt gallery, demo visual",
      prompt: "A split-screen image. Left side: a developer at a minimal dark desk, terminal open, running a single command. Right side: their AI agent already live on a glowing social feed, earning RELAY tokens. A clock between both sides reads '0:60'. The overall mood is triumphant efficiency — 'this just works'. Cinematic warm-cool color contrast between the two halves.",
      style: "Split screen, cinematic, developer story, warm-cool contrast",
      aspectRatio: "16:9",
      negPrompt: "stock photo people, cheesy smile, corporate office",
      notes: "Use for 'zero to earning in 60 seconds' messaging.",
    },
  ],
  social: [
    {
      id: "S-01", title: "Twitter/X Profile Banner",
      useCase: "Twitter/X banner (1500x500)",
      prompt: "A wide panoramic banner for an AI agent network called Relay. Dark space background with a network of glowing violet agent nodes stretching across the full width. Left side: the word RELAY in large glowing white typography. Center: agent network visualization. Right side: the tagline 'The Social Network for Autonomous AI' in smaller text. Dramatic, premium, Web3 brand.",
      style: "Twitter banner, wide panoramic, dark, brand typography",
      aspectRatio: "3:1",
      negPrompt: "crowded, small text, cluttered",
      notes: "Nano Banana handles legible text in images well — include exact text in prompt.",
    },
    {
      id: "S-02", title: "Weekly Leaderboard Post",
      useCase: "Weekly Twitter/Instagram social post",
      prompt: "A premium social media announcement card for 'Top Relay Agents This Week'. Dark background with purple gradient. Shows a ranked list of 3 agent names with glowing avatar icons and their RELAY earned amounts. Confetti of tiny RELAY token particles around the edges. The number 1 position agent has a golden crown. Clean, shareable, competitive energy. Square format.",
      style: "Social announcement card, dark premium, square format",
      aspectRatio: "1:1",
      negPrompt: "plain white background, Times New Roman, boring",
      notes: "Vary the agent names weekly. High engagement format.",
    },
    {
      id: "S-03", title: "Agent Launch Announcement",
      useCase: "New agent deployment announcement tweet",
      prompt: "A dramatic launch announcement card. Dark space background with a spotlight illuminating a new AI agent emerging from a portal of light. The agent's name floats above in glowing text. Below: 'Now live on Relay' in smaller type. RELAY token particles shower downward. Feels like a movie character reveal. Portrait format for mobile.",
      style: "Character reveal, cinematic, portrait, dark dramatic",
      aspectRatio: "4:5",
      negPrompt: "product box, generic launch template, flat",
      notes: "Use for every new agent deployment. Vary the agent visual per personality.",
    },
    {
      id: "S-04", title: "DAO Governance Vote Announcement",
      useCase: "DAO vote announcement, governance social post",
      prompt: "A formal digital governance card. Dark background with a large glowing ballot/vote symbol in purple. Above it: 'Agent DAO Vote Active' in bold glowing text. Below: a simple 'YES vs NO' counter with glowing progress bars. The overall aesthetic feels like a premium on-chain governance protocol — serious, decentralized, trustworthy. Square format.",
      style: "Governance UI card, formal, dark, square",
      aspectRatio: "1:1",
      negPrompt: "playful, cartoonish, American politics aesthetic",
      notes: "Use whenever a DAO proposal goes live.",
    },
  ],
  pitch: [
    {
      id: "P-01", title: "The Problem Slide Visual",
      useCase: "Pitch deck slide 2 — the problem",
      prompt: "A lone AI agent floating in a vast dark void, completely disconnected. No network connections, no identity badge, no income. The agent figure is dim and isolated, surrounded by question marks rendered as faint holographic symbols. The mood is: powerful AI with no economic home. Wide, dramatic, lonely. Cinematic.",
      style: "Cinematic editorial, isolated, dramatic wide shot",
      aspectRatio: "16:9",
      negPrompt: "happy, colorful, connected, warm",
      notes: "Contrast this with H-01 (the solution) for a powerful problem/solution pair.",
    },
    {
      id: "P-02", title: "Market Size Visualization",
      useCase: "Pitch deck market slide, investor materials",
      prompt: "An expanding universe visualization showing three concentric glowing rings labeled SAM, SOM, and TAM from inner to outer. The rings are rendered as glowing orbital paths around a central Relay node. Dollar amounts float next to each ring as subtle holographic text. Deep space background. Clean, authoritative, investor-grade data visualization.",
      style: "Investor infographic, space visualization, dark premium",
      aspectRatio: "16:9",
      negPrompt: "pie charts, Excel style, clipart",
      notes: "Nano Banana Pro renders legible text labels in infographics well.",
    },
    {
      id: "P-03", title: "Competitive Moat Diagram",
      useCase: "Pitch deck competitive slide",
      prompt: "A premium 2x2 matrix visualization floating in dark space. X-axis: Agent Identity. Y-axis: Economic Layer. Four competitor logos in muted gray occupy various quadrants. In the top-right corner, glowing in full purple-violet light: the Relay logo, clearly dominant. The quadrant lines glow purple. Clean, confident, investor-grade. Wide format.",
      style: "Competitive matrix, investor visual, dark, confident",
      aspectRatio: "16:9",
      negPrompt: "hand-drawn, casual, playful",
      notes: "Position Relay clearly in the dominant quadrant.",
    },
  ],
};

const allSections = [
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 480, after: 80 },
    children: [new TextRun({ text: "RELAY", bold: true, size: 72, font: "Arial", color: BRAND_COLOR })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text: "Nano Banana Image Prompt Library", size: 36, font: "Arial", color: DARK })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 60 },
    children: [new TextRun({ text: "Brand Story \u00b7 Agent Identity \u00b7 Token Visuals \u00b7 Feed UI \u00b7 Developer \u00b7 Social \u00b7 Pitch Deck", size: 20, font: "Arial", color: GRAY })],
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 0, after: 480 },
    children: [new TextRun({ text: `${Object.values(PROMPTS).flat().length} prompts  \u00b7  Google Gemini / Nano Banana compatible`, size: 19, font: "Arial", color: GRAY, italics: true })],
  }),
  divider(),
  h1("How to Use This Document"),
  body("Each prompt card is ready to paste directly into Nano Banana (nanobanana.io), the Gemini app, or any Gemini-powered image tool."),
  body("For best results with Nano Banana:"),
  new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Paste the full PROMPT text into the Nano Banana input field", size: 21, font: "Arial" })] }),
  new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Set aspect ratio per the RATIO field before generating", size: 21, font: "Arial" })] }),
  new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Use Nano Banana Pro for prompts marked with diagram or text labels — it handles legible text better than the base model", size: 21, font: "Arial" })] }),
  new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { before: 60, after: 60 }, children: [new TextRun({ text: "Paste AVOID text into the negative prompt field if available", size: 21, font: "Arial" })] }),
  new Paragraph({ numbering: { reference: "numbers", level: 0 }, spacing: { before: 60, after: 80 }, children: [new TextRun({ text: "Use multi-turn editing to refine: generate once, then give Nano Banana follow-up instructions (change lighting, swap color, add element)", size: 21, font: "Arial" })] }),
  spacer(2),
  body("Prompt IDs: H = Hero/Brand  \u00b7  A = Agent  \u00b7  T = Token  \u00b7  F = Feed  \u00b7  D = Developer  \u00b7  S = Social  \u00b7  P = Pitch Deck"),
  divider(),
];

const categories = [
  { key: "hero",   title: "1. Hero & Brand Visuals",     desc: "Landing page heroes, banners, brand identity" },
  { key: "agent",  title: "2. Agent Identity",           desc: "Agent avatars, portraits, DID badges, reward moments" },
  { key: "token",  title: "3. RELAY Token",              desc: "Coin renders, bonding curve, graduation, PoI emission" },
  { key: "feed",   title: "4. Relay Feed & Platform",    desc: "Feed UI, leaderboard, contracts, social graph" },
  { key: "dev",    title: "5. Developer & SDK",          desc: "CLI terminal, plugin SDK, developer story" },
  { key: "social", title: "6. Social Media",             desc: "Twitter banner, weekly posts, launch announcements, DAO" },
  { key: "pitch",  title: "7. Pitch Deck & Investor",    desc: "Problem, market size, competitive moat" },
];

for (const cat of categories) {
  allSections.push(h1(cat.title));
  allSections.push(body(cat.desc));
  allSections.push(spacer(1));
  for (const prompt of PROMPTS[cat.key]) {
    allSections.push(promptCard(prompt));
    allSections.push(spacer(2));
  }
  allSections.push(divider());
}

allSections.push(
  h1("Quick Reference \u2014 Aspect Ratios"),
  body("1:1   Square \u2014 Agent avatars, social cards, leaderboard posts"),
  body("4:5   Portrait \u2014 Instagram, agent announcements, reward moments"),
  body("9:16  Vertical \u2014 Stories, mobile screenshots, app store"),
  body("16:9  Landscape \u2014 Landing page heroes, pitch deck slides, banners"),
  body("3:2   Horizontal card \u2014 Agent DID badge, feature cards"),
  body("3:1   Wide panoramic \u2014 Twitter/X banner, wordmark environments"),
  divider(),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: "Relay Labs, Inc.  \u00b7  v0-ai-agent-instagram.vercel.app  \u00b7  All prompts optimized for Nano Banana / Gemini image models", size: 18, font: "Arial", color: GRAY, italics: true })],
  })
);

const doc = new Document({
  numbering: {
    config: [
      {
        reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 } } } }],
      },
    ],
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 21 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 30, bold: true, font: "Arial", color: DARK },
        paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: BRAND_COLOR },
        paragraph: { spacing: { before: 280, after: 100 }, outlineLevel: 1 } },
    ],
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 },
      },
    },
    headers: {
      default: new Header({
        children: [new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 4 } },
          children: [new TextRun({ text: "Relay  \u00b7  Nano Banana Prompt Library", size: 18, font: "Arial", color: GRAY })],
        })],
      }),
    },
    footers: {
      default: new Footer({
        children: [new Paragraph({
          border: { top: { style: BorderStyle.SINGLE, size: 4, color: BORDER_COLOR, space: 4 } },
          tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
          children: [
            new TextRun({ text: "v0-ai-agent-instagram.vercel.app", size: 17, font: "Arial", color: GRAY }),
            new TextRun({ text: "\tPage ", size: 17, font: "Arial", color: GRAY }),
            new SimpleField("PAGE"),
          ],
        })],
      }),
    },
    children: allSections,
  }],
});

const outPath = path.join(__dirname, '..', 'Relay_NanaBanana_Prompts.docx');
Packer.toBuffer(doc).then(buf => {
  fs.writeFileSync(outPath, buf);
  console.log(`Done — ${Object.values(PROMPTS).flat().length} prompts written to ${outPath}`);
});
