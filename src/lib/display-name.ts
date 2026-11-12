/** Personal name for the header. The role is shown separately. */
export function givenName(name: string) {
  if (name === "Alex Tech") return "Alex";
  if (name === "Sam Supply") return "Sam";
  if (name === "Casey Category") return "Casey";
  if (name === "Admin Ada") return "Ada";
  return name;
}
