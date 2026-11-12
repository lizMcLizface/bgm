/** Package only the constructor journal dependency for the standalone Native
 * reference. Raw Native source remains a separately hashed forensic artifact. */
export function motionReferenceExecutable(reference,journal) {
    if(typeof reference!=='string'||typeof journal!=='string')throw Error('Invalid Motion reference source');
    const source=reference.replaceAll('\r\n','\n'),helper=journal.replaceAll('\r\n','\n');
    const dependency=/^import\s*\{\s*AudioConstructorJournal\s*,\s*settleAudioCleanup\s*\}\s*from\s*['"]\.\.\/audio\/constructorJournal\.js['"];?\s*$/gm;
    const matches=[...source.matchAll(dependency)];
    if(matches.length!==1||/^\s*import\s/m.test(source.replace(dependency,'')))throw Error('Motion reference must have exactly its declared constructor dependency');
    const exports=[...helper.matchAll(/^export\s+(class|function)\s+(\w+)/gm)];
    if(exports.length!==2||exports[0][2]!=='AudioConstructorJournal'||exports[1][2]!=='settleAudioCleanup'||/^\s*import\s/m.test(helper))throw Error('Unexpected constructor journal module shape');
    const scoped=helper.replace(/^export\s+(?=class|function)/gm,'');
    if(/^\s*export\s/m.test(scoped))throw Error('Unexpected constructor journal module shape');
    return 'const {AudioConstructorJournal,settleAudioCleanup}=(()=>{\n'+scoped+'\nreturn {AudioConstructorJournal,settleAudioCleanup};\n})();\n'+source.replace(dependency,'');
}
