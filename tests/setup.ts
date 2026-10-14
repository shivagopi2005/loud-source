import dotenv from 'dotenv';
dotenv.config();

// Ensure test encryption key is set
if (!process.env.ENCRYPTION_KEY_HEX) {
  process.env.ENCRYPTION_KEY_HEX =
    'b85786ad7a0600558236013b8efd6c986dabb285e93670f5fbd39c2796fefb22';
}

if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test_jwt_secret_32_characters_long_min!';
}
