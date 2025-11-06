import React from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'

const Landing = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="landing-container">
      <div className="landing-content">
        <div className="landing-header">
          <h1>Logged In</h1>
          {user && <p className="welcome-text">Welcome, {user.firstName} {user.lastName}!</p>}
        </div>

        <button onClick={handleLogout} className="btn btn-logout">
          Logout
        </button>
      </div>
    </div>
  )
}

export default Landing
