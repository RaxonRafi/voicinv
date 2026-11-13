// Public API of the auth module. Other modules import only from this file.
// (`AuthGuard` and `@CurrentAuth()` live in `src/common`, so protecting a route never
// requires importing this module.)
export { AuthModule } from './auth.module.js';
