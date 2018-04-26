const path = require('path')
const SingleEntryPlugin = require('webpack/lib/SingleEntryPlugin')
const SingleEntryDependency = require('webpack/lib/dependencies/SingleEntryDependency')

const genAsset = (code) => ({
  source() {
    return code
  },
  size() {
    return code.length
  }
})

const PLUGIN_MAIN_ENTRY = 'plugin-main'

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


    const { publicComponents = [], main } = this.rawPluginConfig

    for (const pc of Object.values(publicComponents)) {
      this.entries[pc] = path.resolve('src', pc + '.js')
    }

    if (main) {
      // 增加api入口构建
      this.entries[PLUGIN_MAIN_ENTRY] = path.resolve('src', main)
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
      // promisify addEntry
      const addEntry = (entry, name) => {
        return new Promise((resolve, reject) => {
          const dep = MpvueExtraPlugin.createDependency(entry, name)
          compilation.addEntry(context, dep, name, err => {
            if (err) return reject(err)
            resolve()
          })
        })
      }

      // 动态插入所有的entry
      Promise.all(
        Object.keys(this.entries)
          .map(name => addEntry(this.entries[name], name))
      ).then(() => next(), next)
    })

    compiler.plugin('emit', (compilation, next) => {
      // 生成plugin.json
      const actualPluginConfig = { ...this.rawPluginConfig }
      const apiRootChunk = compilation.chunks.find(c => c.name === PLUGIN_MAIN_ENTRY)
      if (apiRootChunk) {
        actualPluginConfig.main = apiRootChunk.files[0]
      }
      const pluginConfigContent = JSON.stringify(actualPluginConfig)
      compilation.assets['plugin.json'] = genAsset(pluginConfigContent)

      // 给每个publicComponent生成一个.json文件
      Object.values(this.rawPluginConfig.publicComponents)
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
