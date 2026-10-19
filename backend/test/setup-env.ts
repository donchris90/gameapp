// Runs before each test file: point the app at the throwaway test database.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://postgres@localhost:5433/playcircle_test';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-123';
process.env.AUTH_RATE_PER_MINUTE = '100000';
process.env.GLOBAL_RATE_PER_MINUTE = '100000';
process.env.SIGNUP_BONUS_COINS = '1000';
process.env.MIN_AGE_YEARS = '18';
process.env.STORE_MODE = 'fake';
// Computer opponents wait this long before joining a free game, so other tests never meet one by accident.
process.env.BOT_FILL_MS_MIN = '3600000';
process.env.BOT_FILL_MS_MAX = '3600001';
process.env.BOT_MOVE_MS_MIN = '0';
process.env.BOT_MOVE_MS_MAX = '5';
