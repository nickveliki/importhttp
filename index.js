const http = require("http")
const sources = []
const addSource = (src)=>{
    if(!sources.map((source)=>source.src).includes(src)){
        //console.log("sources doesn't contain source")
        sources.push({src, files:[]})
        return sources[sources.length-1]
    }else{
        return sources.find((source)=>source.src==src);
    }
}
const addFile = (url)=>{
    const source = urlContainsSource(url);
    if(source){
        const {files} = addSource(source[0])
        if(!files.includes(url.replace(source[0], ""))){
            files.push(url.replace(source[0], ""))
        }
        return url
    }
    return resolveSource(url)+url;
}
const resolveSource = (file)=>{
    return sources.find(({files})=>files.includes(file)).src
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
                files.forEach((file)=>{
                    addFile(src+file)
                })
                //console.log(sources)
                resolve()
            })
        }else{
            rej(err)
        }
    })
})
const importhttp = (url)=>new Promise((resolve, rej)=>{
    const requesturl = addFile(url)
    if(requesturl){
        http.get(requesturl, (res)=>{
            if(res.statusCode<400){
                const data = [];
                    res.on("data", (d)=>{
                        data.push(...d)
                    })
                    res.on("end", ()=>{
                        import("data:text/javascript,"+Buffer.from(data)).then(resolve, rej)
                    })
            }else{
                rej(res.statusCode)
            }
        })
    }else{
        rej("can't resolve filename to source")
    }
    
})
module.exports = {importhttp, sourceContent};
