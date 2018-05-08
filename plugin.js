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
    this.pluginConfigPath = options.pluginConfigPath
    this.rawPluginConfig = null
    this.componentEntries = {}
    this.entries = {}
  }

  resolvePluginConfig(options = {}) {
    const { entry, context } = options
    if (!this.rawPluginConfig) {
      let pluginConfigPath = entry || this.pluginConfigPath
      pluginConfigPath = path.isAbsolute(pluginConfigPath)
        ? pluginConfigPath
        : path.join(context, pluginConfigPath)
      const pluginConfig = require(pluginConfigPath) || {}
      this.rawPluginConfig = pluginConfig
    }


    const { publicComponents = [], main } = this.rawPluginConfig

    for (const pc of Object.values(publicComponents)) {
      this.entries[pc] = this.componentEntries[pc] = path.join(context, pc + '.js')
    }

    if (main) {
      // 增加api入口构建
      this.entries[PLUGIN_MAIN_ENTRY] = path.join(context, main)
    }
  }

  apply(compiler) {
    this.resolvePluginConfig(compiler.options)

    compiler.plugin('after-resolvers', compiler => {
      // FIXME: 魔改compiler.options.entry
      // 因为mpvue-loader要根据entry的内容做判断是否需要编译
      // 最好去改下mpvue-loader的代码
      // 这里只把component相关的entries放进去
      compiler.options.entry = { ...this.componentEntries }
    })

    compiler.plugin('compilation', (compilation, { normalModuleFactory }) => {
      compilation.dependencyFactories.set(
        SingleEntryDependency,
        normalModuleFactory
      )
    })

    compiler.plugin('make', (compilation, next) => {
      const context = compilation.options.context
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
