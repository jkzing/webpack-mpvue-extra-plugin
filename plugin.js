const path = require('path')
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin')
// const MultiEntryPlugin = require('webpack/lib/MultiEntryPlugin')
const SingleEntryDependency = require('webpack/lib/dependencies/SingleEntryDependency')
// const MultiEntryDependency = require('webpack/lib/dependencies/MultiEntryDependency')

const genAsset = (code) => ({
  source() {
    return code
  },
  size() {
    return code.length
  }
})

const COMPONENT_JSON_CONTENT = JSON.stringify({
  component: true
})

module.exports = class MpvueExtraPlugin {
  constructor(options = {}) {
    this.rawPluginConfig = options.pluginConfig || null
    this.entries = {}
  }

  resolvePluginConfig(options = {}) {
    if (!this.rawPluginConfig) {
      // 没有传入plugin config时从entry加载
      const { entry, context } = options
      const configPath = path.isAbsolute(entry)
        ? entry
        : path.join(context, entry)
      const pluginConfig = require(path.resolve(context, entry)) || {}
      this.rawPluginConfig = pluginConfig
    }
    const publicComponents = this.rawPluginConfig.publicComponents || []

    for (const pc of Object.values(publicComponents)) {
      this.entries[pc] = path.resolve('src', pc + '.js')
    }
  }

  apply(compiler) {
    this.resolvePluginConfig(compiler.options)

    compiler.plugin('after-resolvers', compiler => {
      // 魔改compiler.options.entry
      // 因为mpvue-loader要根据entry的内容做判断
      // 最好去改下mpvue-loader的代码
      compiler.options.entry = { ...this.entries }
    })

    compiler.plugin('compilation', (compilation, { normalModuleFactory }) => {
      compilation.dependencyFactories.set(
        SingleEntryDependency,
        normalModuleFactory
      )
    })

    compiler.plugin('make', (compilation, next) => {
      const context = path.resolve()
      const addEntry = (entry, name) => {
        return new Promise((resolve, reject) => {
          const dep = MpvueExtraPlugin.createDependency(entry, name)
          compilation.addEntry(context, dep, name, err => {
            if (err) return reject(err)
            resolve()
          })
        })
      }

      Promise.all(
        Object.keys(this.entries)
          .map(name => addEntry(this.entries[name], name))
      ).then(() => next(), next)
    })

    compiler.plugin('emit', (compilation, next) => {
      // 生成plugin.json
      const pluginConfigContent = JSON.stringify(this.rawPluginConfig)
      compilation.assets['plugin.json'] = genAsset(pluginConfigContent)

      // 给每个publicComponent生成一个.json文件
      Object.keys(this.entries)
        .forEach(name => {
          compilation.assets[`${name}.json`] = genAsset(COMPONENT_JSON_CONTENT)
        })
      next()
    })
  }

  static createDependency(entry, name) {
    return SingleEntryPlugin.createDependency(entry, name)
  }
}
