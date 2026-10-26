'use strict';

// Integration boundary: replace this verifier when the school's database/API is supplied.
// The development adapter verifies only existing records; it never registers a student.
// Do not import an unknown password hash as scrypt or compare plaintext to an existing hash.
async function verifyExistingAccount(user, password, verifyLocalHash) {
  if (!user || user.enrollmentStatus === 'inactive') return false;
  return verifyLocalHash(password, user.password);
}
module.exports = { verifyExistingAccount };
