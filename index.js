export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(200).send('Bot is active and running autonomously.');
  }

  const message = req.body.message;
  if (!message || !message.text) return res.status(200).send('No text found');

  const chatId = message.chat.id;
  const userText = message.text;

  try {
    const aiResponse = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        temperature: 0.2,
        max_tokens: 1800,
        messages: [
          { role: "system", content: "You are an institutional financial-analysis assistant. Support stocks, ETFs, and cryptocurrencies." },
          { role: "user", content: userText }
        ]
      })
    });

    const aiData = await aiResponse.json();
    const replyText = aiData.choices?.[0]?.message?.content || "שגיאה בניתוח הנתונים מהמודל.";

    await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: replyText
      })
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Autonomous Agent Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
