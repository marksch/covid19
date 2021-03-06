module.exports = {
  lintOnSave: false,
  publicPath: process.env.NODE_ENV === 'production' ? '/' : '/',

  css: {
    loaderOptions: {
      sass: {
        prependData: `@import "@/styles/_variables.scss";`,
      },
    },
  },

  pluginOptions: {
    i18n: {
      locale: 'en',
      fallbackLocale: 'en',
      localeDir: 'locales',
      enableInSFC: false
    }
  }
}
