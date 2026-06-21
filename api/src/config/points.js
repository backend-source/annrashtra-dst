// Reward points. Only verified or converted leads earn (key rule). Not money, so
// these live in code; move to a config table if the business wants them editable.
export const POINTS = {
  lead_verified: 10,   // lead reaches whatsapp_confirmed or otp_verified
  lead_converted: 25,  // lead reaches status 'converted'
};
