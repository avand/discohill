import express from "express";
const app = express();
const PORT = process.env.PORT || 8080;

const FORM_BASE = "https://docs.google.com/forms/d/e/1FAIpQLSc5_ufovxezc8V1jakX5aBFoxcb9avplYnylOzUf7XrqcPoHA/viewform";
const CONFIRMATION_CODE_FIELD_ID = "entry.1043418445";

app.get("/:confirmation_code", (req, res) => {
  const { confirmation_code: confirmationCode } = req.params;
  const redirectUrl = `${FORM_BASE}?${CONFIRMATION_CODE_FIELD_ID}=${encodeURIComponent(confirmationCode)}`;
  res.redirect(302, redirectUrl);
});

app.get("*", (req, res) => {
  res.status(404).send("Not found");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Listening on port ${PORT}`);
});
