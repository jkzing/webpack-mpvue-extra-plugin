const path = require('path')
const fs = require('fs')

const genAsset = (code) => ({
  source() {
    return code
  },
  size() {
    return code.length
  }
})

module.exports = class MpvueExtraPlugin {
  apply(compiler) {
    compiler.plugin('emit', (compilation, next) => {
      const pageReg = /pages\/.+\/.+/i
      compilation.chunks
        .filter(c => pageReg.test(c.name))
        .forEach(pc => {
          const entryResource = pc.entryModule.resource || pc.entryModule.rootModule.resource
          const info = path.parse(entryResource)
          const jsonFile = path.join(info.dir, info.name + '.json')
          let content = JSON.stringify({})
          if (fs.existsSync(jsonFile)) {
            content = JSON.stringify(require(jsonFile))
          }
          compilation.assets[`${pc.name}.json`] = genAsset(content)
        })
      next()
    })
  }
}
