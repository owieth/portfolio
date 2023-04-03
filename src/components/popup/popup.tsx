// import * as Popover from '@radix-ui/react-popover'
// import { Command } from 'cmdk'

// export default function Popup() {
//   return (
//     <Popover.Root>
//       <Popover.Trigger>Toggle popover</Popover.Trigger>

//       <Popover.Content>
//         <Command>
//           <Command.Input />
//           <Command.List>
//             <Command.Item>Apple</Command.Item>
//           </Command.List>
//         </Command>
//       </Popover.Content>
//     </Popover.Root>
//   )
// }

import * as Popover from '@radix-ui/react-popover'
import { Command } from 'cmdk'
import { useEffect, useState } from 'react'

export default function Popup() {
  const [open, setOpen] = useState(false)

  // Toggle the menu when ⌘K is pressed
  useEffect(() => {
    console.log('open');

    const down = (e: any) => {
      if (e.key === 'k' && e.metaKey) {
        console.log(open);

        setOpen(!open)
      }
    }

    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  return (
    <Command.Dialog open={open} onOpenChange={setOpen}>
      <Command.Input />

      <Command.List>
        {/* {loading && <Command.Loading>Hang on…</Command.Loading>} */}

        <Command.Empty>No results found.</Command.Empty>

        <Command.Group heading="Fruits">
          <Command.Item>Apple</Command.Item>
          <Command.Item>Orange</Command.Item>
          <Command.Separator />
          <Command.Item>Pear</Command.Item>
          <Command.Item>Blueberry</Command.Item>
        </Command.Group>

        <Command.Item>Fish</Command.Item>
      </Command.List>
    </Command.Dialog>
  )
}