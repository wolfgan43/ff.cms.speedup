import fs from 'fs';
import path from 'path';
import {SEP, project, DOT, projectPath} from '../constant.js';
import {Log, Stats} from "./log.js";
import fetch from "node-fetch";

const securityBaseDir = (userPath) => {
    if (userPath.indexOf('\0') !== -1) {
        throw new Error("Security violation: " + userPath);
    }

    if (userPath.indexOf(project.basePath) !== 0) {
        throw new Error("Security violation: " + userPath);
    }
}
const mkdir = (dstFilePath) => {
    const dstDirname = path.dirname(dstFilePath);
    securityBaseDir(dstDirname);
    if (!fs.existsSync(dstDirname)) {
        fs.mkdirSync(dstDirname, {recursive: true});
    }
}

export async function findSync({
    srcPath,
    filterExt  = [],
    callback    = null
}) {
    let files = [];
    fs.readdirSync(srcPath).forEach(file => {
        const filepath = srcPath + SEP + file;
        const stat = fs.statSync(filepath);
        if (stat.isDirectory() && path.basename(file).substring(0, 1) !== DOT) {
            files = files.concat(findSync({
                srcPath: filepath,
                filterExt: filterExt,
                callback: callback
            }));
        } else if (stat.isFile() &&
            (filterExt.length === 0 || filterExt.includes(path.extname(file).toLowerCase().substring(1)))
        ) {
            files.push(filepath);
            if (callback) {
                callback(filepath);
            }
        }
    });

    return files;
}

export async function find({
                    srcPath,
                    filterExt  = [],
                    callback    = null
}) {
    let scan = [];
    fs.promises.readdir(srcPath)
        .then((files) => {
            files.forEach(file => {
                const filepath = srcPath + SEP + file;
                fs.promises.stat(filepath)
                    .then((stat) => {
                        if (stat.isDirectory() && path.basename(file).substring(0, 1) !== DOT) {
                            scan = scan.concat(find({
                                srcPath: filepath,
                                filterExt: filterExt,
                                callback: callback
                            }));
                        } else if (stat.isFile() &&
                            (filterExt.length === 0 || filterExt.includes(path.extname(file).toLowerCase().substring(1)))
                        ) {
                            if (callback) {
                                callback(filepath);
                            }
                        }
                    });
            });
        });

    return scan;
}

//rsync -avm --include '*/' --include '*.css' --exclude '*' src/ dist
export function cp({
        srcPath,
        dstPath,
        filterExt = [],
        override = true,
        callback = null
}) {
        return find({
            srcPath: srcPath,
            filterExt: filterExt,
            callback: (srcFilePath) => {
                const dstFilePath = srcFilePath.replace(srcPath, dstPath);
                fs.cp(srcFilePath, dstFilePath, {recursive: true, force: override}, (err) => {
                    if (err) throw err;
                    if (callback) {
                        callback({dstFilePath, srcFilePath});
                    }
                });
            }
        });
}

export async function save(dstFilePath, data, async = true) {
    if (!Stats.isset(dstFilePath, "fsWrite")) {
        const dstDirname = path.dirname(dstFilePath);
        if (!fs.existsSync(dstDirname)) {
            fs.mkdirSync(dstDirname, {recursive: true});
        }
        if (async) {
            fs.writeFile(dstFilePath, data, function (err) {
                if (err) throw err;
            });
        } else {
            fs.writeFileSync(dstFilePath, data);
        }
        Stats.save(dstFilePath,"fsWrite", data.length);
    }
}

export async function saveData(dstFilePath, data, tag = "origin") {
    if (!Stats.isset(dstFilePath, tag)) {
        Log.debug(`- SAVE ${dstFilePath}`);

        Stats.save(dstFilePath, tag, -1);
        mkdir(dstFilePath);
        return (typeof data.then === 'function')
            ? data.then(data => {
                return fs.promises.writeFile(dstFilePath, data).then(() => {
                    Stats.save(dstFilePath,tag, data.length);
                    return {srcFilePath: null, data: data};
                })
            })
            : fs.promises.writeFile(dstFilePath, data).then(() => {
                Stats.save(dstFilePath,tag, data.length);
                return {srcFilePath: null, data: data};
            });
    } else {
        Log.debug(`- SKIP {data} >> ${dstFilePath}`);

        Stats.skip(dstFilePath);
        return {srcFilePath: null, data: data};
    }
}
export async function saveFetch(dstFilePath, srcFetchPath, tag = "origin") {
    if (!Stats.isset(dstFilePath, tag)) {
        Log.debug(`- WGET ${srcFetchPath}`);

        Stats.save(dstFilePath, tag, -1);
        return fetch(srcFetchPath)
            .then(res => res.text())
            .then(body => {
                mkdir(dstFilePath);
                return fs.promises.writeFile(dstFilePath, body).then(() => {
                    Stats.save(dstFilePath, tag, body.length);
                    return {srcFilePath: srcFetchPath, data: body};
                });
            });
    } else {
        Log.debug(`- SKIP ${srcFetchPath}`);

        Stats.skip(dstFilePath);
        return {srcFilePath: srcFetchPath, data: null};
    }
}

export async function saveFile(dstFilePath, srcFilePath, tag = "origin") {
    if (!Stats.isset(dstFilePath, tag)) {
        Log.debug(`- COPY ${srcFilePath}`);

        Stats.save(dstFilePath,tag, -1);
        mkdir(dstFilePath);

        return fs.promises.copyFile(srcFilePath, dstFilePath).then(() => {
            Stats.save(dstFilePath, tag, fs.statSync(dstFilePath).size);
            return {srcFilePath, data: fs.readFileSync(dstFilePath).toString()};
        });
    } else {
        Log.debug(`- SKIP ${srcFilePath}`);

        Stats.skip(dstFilePath);
        return {srcFilePath, data: null};
    }
}

const rm = (folderPath) => {
    if (fs.existsSync(folderPath)) {
        fs.readdirSync(folderPath).forEach((file) => {
            const curPath = path.join(folderPath, file);
            if (fs.lstatSync(curPath).isDirectory()) {
                rm(curPath);
            } else {
                fs.unlinkSync(curPath);
            }
        });

        fs.rmdirSync(folderPath);
    }
}

export function deleteProject(environment) {
    rm(projectPath + SEP + environment);
}