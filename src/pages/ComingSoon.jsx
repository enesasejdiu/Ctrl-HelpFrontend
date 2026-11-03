// ComingSoon.jsx – temporary placeholder for routes whose pages are built in later phases (7–10).
import { Construction } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState, PageHeader } from '../components/Ui'

export default function ComingSoon({ title }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="card">
        <EmptyState
          icon={Construction}
          title="This page is on its way"
          action={
            <Link to="/tickets" className="btn btn--secondary">
              Back to tickets
            </Link>
          }
        >
          It will be added in a later phase of the project.
        </EmptyState>
      </div>
    </>
  )
}
