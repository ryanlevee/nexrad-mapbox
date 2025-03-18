class Utl {
    // // NO NEED YET
    // static no = () => { };
    // static up = this.call.bind(''.toUpperCase)

    static up = x => x.toUpperCase();

    static cLog(v, s = '') {
        console.log(s);
        console.log(v);
    }

    // static sleep = sec => new Promise(resolve => {
    //     console.log('awaited');
    //     return setTimeout(resolve, sec * 1000);
    // });

    static async sleep(s) {
        const start = Date.now()
        console.log('timeout started', (Date.now() - start) / 1000)

        return new Promise(resolve => {
            return setTimeout(() => {
                resolve(true);
                console.log('timeout resolved', (Date.now() - start) / 1000)
            }, s * 1000);
        });
    }

    static arrayIfNot = arr => Array.isArray(arr) ? arr : [arr];

    static getObjArrVals = (arrOfObjs, key) =>
        [...(new Set(arrOfObjs.flatMap(obj => obj[key] ? String(obj[key]) : null)))];

    // NOT USING YET
    static getObjArrFromObjArr = (arrOfObjs, keyArr) =>
        arrOfObjs.map(obj =>
            Utl.arrayIfNot(keyArr).reduce((acc, key) => (
                acc[key] = obj[key], acc
            ), {})
        );

    static truthy(item) {
        if (!item) return false;
        else if (Array.isArray(item)) return item.some(Utl.truthy);
        else if (typeof item == 'object') return Object.values(item).some(Utl.truthy);
        return true;
    }

    // // NOT USING HERE
    // static pushNonArray = (val1, val2) => [...val1 || [], val2];

    static removeArrayItems(origArray, removeArray) {
        if (!removeArray || !removeArray.length) return origArray;
        return origArray.filter(item => !Utl.arrayIfNot(removeArray).includes(item));
    }

    // NOT USING HERE
    static removeArrOfObjDupes = arrOfObjs =>
        [...(new Set(arrOfObjs?.map(JSON.stringify)))].map(JSON.parse);

    static compose = (...fns) => x => fns.reduceRight((acc, fn) => fn(acc), x);

    // // Verbose - For-loop version (only one that works)
    static pipeAsyncNested = fns => x => fns.reduce(async (acc, fn) => {
        acc = await acc;

        if (Array.isArray(fn)) {
            for (const f of fn) {
                if (Array.isArray(f)) {
                    // no `acc =` else each sub-arr gets result from prior sub-arr
                    await this.pipeAsyncNested(f)(acc);
                } else {
                    // need `acc =` here so control.primary feeds to subsequent arrays in for-loop
                    acc = f(acc);
                }
            }
            // no `return acc` needed here bc final func sqlControl.errors has no param
        } else {
            // return here so each non-array func feeds subsequent array
            return fn(acc);
        }
    }, x);

    // // Abbrev - For-loop version (only one that works)
    // static pipeAsyncNested = fns => x => fns.reduce(async (acc, fn) => {
    //     acc = await acc;
    //     if (Array.isArray(fn))
    //         for (const f of fn)
    //             if (Array.isArray(f)) await this.pipeAsyncNested(f)(acc);
    //             else acc = await f(acc);
    //     else return await fn(acc);
    // }, x);

    // // Copilot version - still not working but better than Array method
    // static pipeAsyncNested = fns => x => fns.reduce(async (acc, fn) => {
    //     acc = await acc;
    //     console.log(`fn ${fn.name || typeof fn} acc:`, acc);
    //     if (Array.isArray(fn)) {
    //         acc = await fn.map(f => async innerAcc => {
    //             innerAcc = await innerAcc;

    //             if (Array.isArray(f)) {
    //                 return await this.pipeAsyncNested(f)(innerAcc);
    //             } else {
    //                 return await f(innerAcc);
    //             }
    //         }).reduce((promise, func) => promise.then(func), Promise.resolve(acc));
    //     } else {
    //         return await fn(acc);
    //     }
    // }, x);

    // // Shorthand - Array method version - does not work
    // static pipeAsyncNested = fns => x => fns.reduce(async (acc, fn) => (
    //     acc = await acc, Array.isArray(fn) ? await Promise.all(fn.map(async f =>
    //         Array.isArray(f) ? await this.pipeAsyncNested(f)(acc) : acc = await f(acc)
    //     )) : await fn(acc)
    // ), x);

    // // Verbose - Array method version - does not work
    // static pipeAsyncNested = fns => x => fns.reduce(async (acc, fn) => {
    //     acc = await acc;
    //     console.log(`fn ${fn.name || typeof fn} acc:`, acc);
    //     if (Array.isArray(fn)) {
    //         await Promise.all(fn.reduce(async (acc, f) => {
    //             if (Array.isArray(f)) {
    //                 await this.pipeAsyncNested(f)(acc);
    //             } else {
    //                 acc = await f(acc);
    //             }
    //         }), acc);
    //     } else {
    //         return await fn(acc);
    //     }
    // }, x);

    // // Non-nested pipeAsync
    // static pipeAsync = fns => x => fns.reduce(async (acc, fn) => (
    //     Array.isArray(fn) ? this.pipe(fn)(await acc) : await fn(await acc)
    // ), x);

    // // Not sure this even returns all r[newKey] (i.e. all matching values)
    // static getMatchingObjVals(arr, matchKey, matchValue, newKey) {
    //     return [...(new Set(arr.map(r =>
    //         String(r[matchKey]) == String(matchValue) ? r[newKey] : false
    //     ).flat()))].filter(Boolean);
    // };

    // // NOT USING HERE
    static sqlizeQuotes(values) {
        values.forEach((v, i, values) =>
            values[i] = `'${`${v}`.replaceAll("'", "''")}'`
        );
    }

    static sqlizeNulls(arr) {
        arr.forEach((a, i) =>
            a && (
                arr[i] = a
                    .replace("''NULL''", null)
                    .replace("'NULL'", null)
                    .replace("'null'", null)
                    .replace("null", null)
            )
        );
    }

    // // NOT USING HERE
    static nullifyStringNulls(valueString) {
        return valueString
            .replaceAll("''NULL''", 'NULL')
            .replaceAll("'NULL'", 'NULL')
            .replaceAll("'null'", 'NULL')
            .replaceAll("null", 'NULL');
    }

    // // NOT USING HERE
    // static nullifyUndefineds(obj) {
    //     Object.keys(obj).forEach(key => {
    //         if (obj[key] == undefined) {
    //             obj[key] = null;
    //         }
    //     });
    // }

    // // NOT USING HERE
    // static stringNullifyFalseys(data) {
    //     Object.keys(data).forEach(key => {
    //         if (!data[key]) {
    //             data[key] = 'null';
    //         }
    //     });
    // }

    // // NOT USING ANYMORE
    // static async resolveArray(array) {
    //     const resolved = await Promise.all(array.map(async r => await r));
    //     const flattened = Utl.flattenArray(resolved);
    //     const cleaned = flattened.filter(Boolean);
    //     return cleaned;
    // }

    // // NOT USING HERE
    static flattenSingle = arr => [].concat.apply([], arr);

    // // Shorthand
    static flattenArray = (nested, flat = []) => (
        Array.isArray(nested)
            ? nested.forEach(n => Utl.flattenArray(n, flat))
            : flat.push(nested),
        flat
    );

    static mergeArrays = (arr1, arr2) => 
        [...Utl.arrayIfNot(arr1) || [], ...Utl.arrayIfNot(arr2) || []]

    static deepClone(obj) {
        return JSON.parse(JSON.stringify(obj));
    }
    
    // // Verbose
    // static flattenArray(nested, flat = []) {
    //     if (Array.isArray(nested)) {
    //         nested.forEach(n =>
    //             Utl.flattenArray(n, flat)
    //         );
    //     } else {
    //         flat.push(nested);
    //     }
    //     return flat;
    // }

    // // This is slower than mine above because of the reduce + spread operator (also slower than concat)
    // static flattenArray(nested) {
    //     return nested.reduce((a, n) => {
    //         if (Array.isArray(n)) {
    //             a.push(...Utl.flattenArray(n))
    //         } else {
    //             a.push(n);
    //         }
    //         return a;
    //     }, []);
    // }

    // // NOT USING HERE
    static getParsedJsonValues = data => Object.values(JSON.parse(data));

    // // NOT USING HERE
    // static async sleep(s) {
    //     return new Promise(resolve =>
    //         setTimeout(() => resolve(true), s * 1000)
    //     );
    // }

    static localizeDatetime(dt) {
        const loc = 'en-US';
        const options = { timeZone: 'America/Los_Angeles', hourCycle: 'h24' };
        return (dt || new Date()).toLocaleString(loc, options).replace(',', '');
    }

    static getNowDatetime = () => Utl.localizeDatetime();

    static sqlizeDates(values) {
        const re = new RegExp(
            '^(\\d{4})-(\\d{2})-(\\d{2})(T|\\W)?(\\d{2}):(\\d{2})'
            + ':(\\d{2}(?:\\.\\d*)?)((-(\\d{2}):(\\d{2})|Z)?)$'
        );

        values.forEach((v, i) => {
            if (v && (re.test(v) || v instanceof Date)) {

                if (typeof v == 'string') {
                    v = new Date(v);
                }
                else if (typeof v == 'object') {
                    v = v.toISOString();
                    v = v.replace('T', ' ').replace('Z', '');
                }

                values[i] = Utl.localizeDatetime(v);
            }
        });
    }

    // // NOT USING HERE, and prob needs adjusting
    // static sqlizeDate(value) {
    //     return Utl.localizeDatetime(value);
    // }

    static sortObjectByArray(obj, arr) {
        const objLower = Object.fromEntries(
            Object.entries(obj).map(([k, v]) => [k.toLowerCase(), v])
        );

        return arr.reduce((acc, key) => {
            key = key.toLowerCase();
            if (key in objLower) {
                acc[key] = objLower[key];
            } else {
                acc[key] = null;
            }
            return acc;
        }, {});
    }

    static objToOpenXML(arr) {
        let xml = '<ROOT>';

        arr.forEach(obj => {
            xml += '<Data';
            Object.entries(obj).forEach(([k, v]) => xml += ` ${k}="${v}"`);
            xml += '></Data>';
        });

        xml += '</ROOT>';
        return xml;
    }

    static chunkArray(arr, size) {
        const chunk = Number(size);
        if (arr.length >= chunk) {
            return arr.reduce((acc, _, index) => (
                index % chunk === 0
                && acc.push(arr.slice(index, index + chunk)),
                acc
            ), []);
        }
        return [arr];
    }

    // Verbose
    static chunkObjOfArrays(obj, size) {
        const chunk = Number(size);

        return Object.entries(obj).reduce((acc, [key, arr]) => {
            if (arr.length >= chunk) {
                const newObj = { [key]: arr.splice(chunk) };
                acc.push(Utl.chunkObjOfArrays(newObj, chunk));
            }

            return acc.push({ [key]: arr }), acc.flat();
        }, []);
    }

    // // Shorthand
    // static chunkObjOfArrays = (obj, size) => (
    //     size = Number(size), 
    //     Object.entries(obj).reduce((acc, [key, arr]) => (
    //         (arr.length >= chunk) &&
    //         acc.push(Utl.chunkObjOfArrays({ [key]: arr.splice(chunk) }, chunk)),
    //         acc.push({ [key]: arr }),
    //         acc.flat()
    //     ), [])
    // )    
}

export { Utl };
