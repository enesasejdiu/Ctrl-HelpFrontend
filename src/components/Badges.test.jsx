// Badges.test.jsx – status, priority and overdue badges show the right label and color variant.
// The color variant is only expressed as a CSS class (index.css), so that's what the variant checks look at.
import { render, screen } from '@testing-library/react'
import { OverdueBadge, PriorityBadge, StatusBadge } from './Badges'

describe('StatusBadge', () => {
  it.each([
    ['open', 'Open'],
    ['assigned', 'Assigned'],
    ['in_progress', 'In Progress'],
    ['waiting_for_user', 'Waiting for User'],
    ['resolved', 'Resolved'],
    ['closed', 'Closed'],
    ['reopened', 'Reopened'],
  ])('shows "%s" as "%s" with its color variant', (status, label) => {
    render(<StatusBadge status={status} />)

    const badge = screen.getByText(label)
    expect(badge).toHaveClass('badge', `badge--status-${status}`)
  })

  it('shows an unknown status as its raw value instead of crashing', () => {
    render(<StatusBadge status="archived" />)

    expect(screen.getByText('archived')).toHaveClass('badge')
  })

  it.each([undefined, null, ''])('renders nothing when the status is %j', (status) => {
    const { container } = render(<StatusBadge status={status} />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('PriorityBadge', () => {
  it.each([
    ['Low', 'low'],
    ['Medium', 'medium'],
    ['High', 'high'],
    ['Critical', 'critical'],
  ])('shows "%s" with the %s color variant', (priority, level) => {
    render(<PriorityBadge priority={priority} />)

    expect(screen.getByText(priority)).toHaveClass('badge', 'badge--priority', `badge--priority-${level}`)
  })

  it('matches the variant case-insensitively', () => {
    render(<PriorityBadge priority="HIGH" />)

    expect(screen.getByText('HIGH')).toHaveClass('badge--priority-high')
  })

  it.each([undefined, null, ''])('renders nothing when the priority is %j', (priority) => {
    const { container } = render(<PriorityBadge priority={priority} />)

    expect(container).toBeEmptyDOMElement()
  })
})

describe('OverdueBadge', () => {
  it('says "Overdue" and explains why on hover', () => {
    render(<OverdueBadge />)

    expect(screen.getByText('Overdue')).toHaveAttribute('title', 'Older than the target time for its priority')
  })
})
