const path = require("path");
const fs = require("fs");
const http = require("http")
const modules = fs.readdirSync("./node_modules").filter((dir)=>fs.statSync(path.join("./node_modules",dir)).isDirectory()&&fs.existsSync(path.join("./node_modules", dir, "package.json"))).map((dir)=>({dir, main: JSON.parse(fs.readFileSync(path.resolve("node_modules",dir, "package.json")).toString()).main}));
const url = require("url");
const crypto = require("crypto");
const init = (source)=>new Promise((res, rej)=>{
    const ecdh = crypto.createECDH("secp521r1");
    const req = http.request(`${source}/init`, {method:"POST"}, (result)=>{
        const data = []
        result.on("data", (d)=>{
            data.push(...d);
        })
        result.on("end", ()=>{
            const bobpub = Buffer.from(data);
            const material = ecdh.computeSecret(bobpub);
            crypto.pbkdf2(material, Buffer.from(result.headers.salt, "base64"), 100000, 32, "sha256", (err, key)=>{
                if(err){
                    rej(err)
                }else{
                    res({key, bobpub})
                }
            })
        })
    });
    req.write(ecdh.generateKeys());
    req.end();
})
const sources = []
const addSource = (src)=>new Promise((res, rej)=>{
    if(!sources.map((source)=>source.src).includes(src)){
        init(src).then(({key, bobpub})=>{
            sources.push({src, files:[], key, bobpub})
            res(sources[sources.length-1])
        }, (err)=>{
            rej(err)
        })
    }else{
        res(sources.find((source)=>source.src==src));
    }
})
const addFile = (url)=>new Promise((res, rej)=>{
    const source = urlContainsSource(url);
    if(source){
        addSource(source[0]).then(({files, key, bobpub})=>{
            if(!files.includes(url.replace(source[0], ""))){
                files.push(url.replace(source[0], ""))
            }
            res({requesturl: url, key, bobpub})    
        }, rej)
    }else{
        const source = resolveSource(url);
        if(source){
            res({requesturl: source.src+url, key: source.key, bobpub: source.bobpub})
        }else{
            rej("couldn't resolve source to "+url)
        }
    }
})
const resolveSource = (file)=>{
    return sources.find(({files})=>files.includes(file))
}
const urlContainsSource = (url)=>{
    return typeof(url)=="string"?url.match(/^http:\/\/[\w_-]*(:\d*)?\//):undefined
}
const sourceContent = (src)=>new Promise((resolve, rej)=>{
    http.get(src, (res)=>{
        if(res.statusCode<400){
            const data = []
            res.on("data", (d)=>{
                data.push(...d)
            })
            res.on("end", ()=>{
                const files = JSON.parse(Buffer.from(data).toString())
                addFile(src+files.shift()).then(({requesturl})=>{
                    //console.log(requesturl)
                    files.forEach((file)=>{
                        addFile(src+file).then(({requesturl})=>{
                            //console.log(requesturl)
                        })
                    })
                    resolve()
                })                
            })
        }else{
            rej(err)
        }
    })
})
const importhttp = (url, authorization="vtoken noauth")=>new Promise((resolve, rej)=>{
    addFile(url).then((reqinfo)=>{
        http.request(reqinfo.requesturl, {method:"GET", headers:{authorization, bobpub:reqinfo.bobpub.toString("base64")}}, (res)=>{
            if(res.statusCode<400){
                    const decrypt = crypto.createDecipheriv("aes-256-gcm", reqinfo.key, Buffer.from(res.headers.iv, "base64"))
                    const data = []
                    res.on("data", (d)=>{
                        data.push(...d);
                    })
                    res.on("end", ()=>{
                        import("data:text/javascript;charset=utf-8;base64,"+Buffer.from(resolveImports(decrypt.update(Buffer.from(data)).toString())).toString("base64")).then(resolve, rej)
                    })
                }else{
                    if(res.statusCode==555){
                        const src = urlContainsSource(reqinfo.requesturl)[0];
                        init(src).then(({key, bobpub})=>{
                            const source = sources.find((source)=>source.src==src);
                            source.key = key;
                            source.bobpub = bobpub;
                            importhttp(url, authorization).then(resolve, rej)
                        })
                    }else{
                        rej(res.statusCode)
                    }
                }
            }).end()           
    }, rej)    
})
const resolveImports = (script)=>{
    const statements = script.split(";").map((statement, index)=>({
        statement, index
    }))

    const imports = statements.filter(({statement})=>statement.includes("import("))
    imports.forEach((imp)=>{
        const target = imp.statement.match(/import\(".*"\)\.then/)

        if(target){
            const module = target[0].replace("import(\"", "").replace("\").then").replace(/undefined/g, "");
            const mtarg = modules.find(({dir})=>dir==module);

            if(mtarg){
                const statement = statements.find(({index})=>index==imp.index)
                if(statement){
                statement.statement = statement.statement.replace(module, url.pathToFileURL(path.resolve(path.join("./", "node_modules", module, mtarg.main))))
                }
            }
        }
    })
    const directimports = statements.filter(({statement})=>statement.includes("import")&&statement.includes("from"))
    directimports.forEach((imp)=>{
        const [imported, target] = imp.statement.split("from");
        const mtarg = modules.find(({dir})=>dir==target.replace(/"/g, "").trim())
        if(mtarg){
            const statement = statements.find(({index})=>index==imp.index);
            if(statement){
                statement.statement = `${imported} from "${url.pathToFileURL(path.resolve("./", "node_modules", target.replace(/"/g, "").trim(), mtarg.main))}"`

            }
        }
    }) 
    return statements.map(({statement})=>statement).join(";")
}
module.exports = {importhttp, sourceContent};
