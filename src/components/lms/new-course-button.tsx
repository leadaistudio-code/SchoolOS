'use client'

import * as React from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/dialog'
import { CourseForm } from './course-form'
import type { LmsResult } from './types'

export function NewCourseButton({
  createCourse,
  builderPath,
  label = 'New course',
}: {
  createCourse: (input: unknown) => Promise<LmsResult>
  builderPath: string
  label?: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="New course" description="You can change any of this later." size="lg">
        <CourseForm createCourse={createCourse} builderPath={builderPath} />
      </Dialog>
    </>
  )
}
