// The demo's sample window. Kept in its own tiny module so client components can import it
// without pulling the demo call data into the browser bundle.
export const DEMO_RANGE = { from: "2026-08-27", to: "2026-09-30" };
export const DEMO_QS = `range=custom&from=${DEMO_RANGE.from}&to=${DEMO_RANGE.to}`;
