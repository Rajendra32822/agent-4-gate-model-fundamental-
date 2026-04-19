// Synchronous token store — AuthContext writes here on every session change.
// authFetch reads from here so it never has to await getSession().
let _token = null;

export const setAccessToken = (token) => { _token = token; };
export const getAccessToken = () => _token;
