# importhttp

## importhttp

arguments: url/filename

returns Promise; resolves to module, rejects to error message [string]

## sourceContent

arguments: source root+folder

returns Promise, resolves undefined, but adds content to resolvable files, rejects to error message [number]

```javascript
import {sourceContent, importhttp} from "importhttp";
sourceContent("http://example.server.tld").then(()=>{
  //resolvable files in example.server.tld: "helloworld.js", "goodbyeverybody.js"
  importhttp("helloworld.js").then((module)=>{
    //prints "hello world" to the console
    module.default();
    importhttp("goodbyeeverybody.js").then((module)=>{
      //prints "goodbye everybody" to the console
      module.default()
    })
  }, console.log)
  
})
```
