const SupportQuery = require('../models/SupportQuery');
const nodemailer = require('nodemailer');

// You can configure your transporter globally, or inside the handler.
// Example transporter for Gmail (for production, use secure SMTP/Sendgrid/etc)
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_USER,   // Put this in your .env file
    pass: process.env.SMTP_PASS,   // Put this in your .env file
  }
});

exports.createSupportQuery = async (req, res) => {
  const { name, email, message } = req.body;

  try {
    // Save the query in the database
    const query = await SupportQuery.create({ name, email, message });

    // Send confirmation email to the user
    await transporter.sendMail({
      from: `"Your App Support" <${process.env.SMTP_USER}>`,
      to: email,
      subject: "We received your support request",
      text: `Hi ${name},\n\nWe received your message:\n"${message}"\n\nOur team will get back to you soon!\n\nBest,\nSupport Team`
    });

    res.json({ message: 'Support query submitted!', queryId: query._id });
  } catch (error) {
    console.error('Support submission error:', error);
    res.status(500).json({ error: 'Failed to submit support query.' });
  }
};
