import { Extension } from '@tiptap/core'

export default Extension.create({
  name: 'tabInsert',

  addKeyboardShortcuts() {
    return {
      Tab: ({ editor }) => {
        // Check if we're in a task list - if so, let TaskItemExtension handle it
        const { $from } = editor.state.selection
        const isInTaskList = $from.node(-1)?.type.name === 'taskList'
        
        if (isInTaskList) {
          return false // Let TaskItemExtension handle tabs in task lists
        }

        // Insert tab character for regular text
        return editor.commands.insertContent('\t')
      },
    }
  },
})