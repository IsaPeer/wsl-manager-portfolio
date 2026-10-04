// Small validation script for the process tree view.
// Run with:
// node src/renderer/src/UI_processes_tree_validation.js

const assert = require('assert').strict

function buildTreeLogic(raw, expandedProcesses) {
  const tree = []

  const allPids = new Set(raw.map((p) => p.pid))
  let topLevelNodes = raw.filter((p) => !allPids.has(p.parentPid))
  topLevelNodes.sort((a, b) => a.name.localeCompare(b.name))

  const buildBranch = (parentNode, level) => {
    tree.push({ ...parentNode, displayLevel: level })
    if (expandedProcesses.includes(parentNode.pid)) {
      const children = raw.filter((p) => p.parentPid === parentNode.pid)
      children.sort((a, b) => a.name.localeCompare(b.name))
      children.forEach((child) => buildBranch(child, level + 1))
    }
  }
  topLevelNodes.forEach((node) => buildBranch(node, 0))
  return tree
}

function runTests() {
  console.log('Running process tree checks...\n')

  // If a parent is missing, the process should still show up.
  console.log('1. orphan handling')
  const input1 = [
    { pid: 1, parentPid: 0, name: 'init' },
    { pid: 50, parentPid: 999, name: 'orphan-proc' }
  ]
  const output1 = buildTreeLogic(input1, [])

  assert.strictEqual(output1.length, 2)
  assert.strictEqual(output1[0].displayLevel, 0)
  assert.strictEqual(output1[1].displayLevel, 0)
  console.log('   passed')

  // Child depth check
  console.log('2. nested levels')
  const input2 = [
    { pid: 1, parentPid: 0, name: 'init' },
    { pid: 10, parentPid: 1, name: 'bash' },
    { pid: 20, parentPid: 10, name: 'python' }
  ]
  const expanded2 = [1, 10]
  const output2 = buildTreeLogic(input2, expanded2)

  assert.strictEqual(output2[0].pid, 1)
  assert.strictEqual(output2[1].pid, 10)
  assert.strictEqual(output2[2].pid, 20)
  assert.strictEqual(output2[2].displayLevel, 2)
  console.log('   passed')

  
  console.log('3. alphabetical sorting')
  const input3 = [
    { pid: 1, parentPid: 0, name: 'z-proc' },
    { pid: 2, parentPid: 0, name: 'a-proc' }
  ]
  const output3 = buildTreeLogic(input3, [])

  assert.strictEqual(output3[0].name, 'a-proc')
  assert.strictEqual(output3[1].name, 'z-proc')
  console.log('   passed')

  // Children should stay hidden until their parent is opened.
  console.log('4. collapsed branches')
  const input4 = [
    { pid: 1, parentPid: 0, name: 'init' },
    { pid: 2, parentPid: 1, name: 'hidden-child' }
  ]
  const output4 = buildTreeLogic(input4, [])

  assert.strictEqual(output4.length, 1)
  console.log('   passed')

  // Bad parent links should not send this into infinite recursion.
  console.log('5. circular references')
  const input5 = [
    { pid: 10, parentPid: 20, name: 'proc-a' },
    { pid: 20, parentPid: 10, name: 'proc-b' }
  ]
  const output5 = buildTreeLogic(input5, [])

  assert.strictEqual(output5.length, 0)
  console.log('   passed')

  console.log('\nAll checks passed.')
}

runTests()
