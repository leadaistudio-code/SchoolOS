/**
 * Metro's transform.
 *
 * `babel-preset-expo` is what rewrites `process.env.EXPO_PUBLIC_*` into the
 * literal value at bundle time. Without this file the app still builds and
 * runs — JSX compiles, routing works — but every EXPO_PUBLIC read evaluates to
 * undefined on the device, so the app silently talks to whatever the fallback
 * says. That is a failure with no error message, which is why it is worth a
 * config file that otherwise looks redundant.
 */
module.exports = function (api) {
  api.cache(true)
  return { presets: ['babel-preset-expo'] }
}
