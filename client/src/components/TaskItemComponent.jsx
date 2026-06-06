import React from 'react'
import { NodeViewWrapper, NodeViewContent } from '@tiptap/react'
import SVGCheckboxCircle from './SVGCheckboxCircle'

const TaskItemComponent = ({ node, updateAttributes, editor }) => {
  const handleChange = (checked) => {
    // Prevent the editor from gaining focus during this operation
    const wasFocused = editor?.isFocused || false;
    
    // Temporarily disable focus events on the editor
    if (editor?.view?.dom) {
      const originalTabIndex = editor.view.dom.tabIndex;
      editor.view.dom.tabIndex = -1;
      
      // Update attributes
      updateAttributes({ checked });
      
      // Restore the original tabIndex and blur if it wasn't focused before
      setTimeout(() => {
        if (editor?.view?.dom) {
          editor.view.dom.tabIndex = originalTabIndex;
          
          // If editor wasn't focused before and is now focused, blur it
          if (!wasFocused && editor.isFocused) {
            editor.commands.blur();
          }
        }
      }, 0);
    } else {
      // Fallback if we can't access the DOM
      updateAttributes({ checked });
    }
  }
    const handleContentClick = (e) => {
    // Prevent default behavior and propagation to avoid any focus changes
    e.preventDefault();
    e.stopPropagation();
    
    // Use the same focus-preventing logic as handleChange
    handleChange(!node.attrs.checked);
  }

  return (
    <NodeViewWrapper as="li" data-type="taskItem" data-checked={node.attrs.checked}>
      <div style={{ display: 'flex', alignItems: 'flex-start' }}>
        <div style={{ flex: '0 0 auto', marginTop: '0px' }}>
          <SVGCheckboxCircle
            checked={node.attrs.checked}
            onChange={handleChange}
            id={`task-${Date.now()}-${Math.random()}`}
            label=""
          />
        </div>        <NodeViewContent 
          as="div" 
          onClick={handleContentClick}
          onMouseDown={(e) => e.preventDefault()} // Prevent focus on mouse down
          style={{ 
            flex: '1 1 auto',
            marginLeft: '4px',
            textDecoration: node.attrs.checked ? 'line-through' : 'none',
            opacity: node.attrs.checked ? 1 : 1, // the opacity is being handled in index.css for both noteform and notecard
            transition: 'opacity 0.2s ease, text-decoration 0.2s ease',
            cursor: 'pointer',
            minWidth: '2px', // Ensure there's always space for the cursor
            minHeight: '1.2em' // Ensure there's always height for the cursor
          }} 
        />
      </div>
    </NodeViewWrapper>
  )
}

export default TaskItemComponent
