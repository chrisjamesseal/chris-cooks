export default function Home() {
  return (
    <div>
      <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 0 }}>My Recipes</h1>
      <p style={{ color: 'var(--muted)', marginBottom: 24 }}>
        No recipes yet. Add your first one!
      </p>
      <button className="btn-primary" style={{ width: '100%' }}>
        + Add Recipe
      </button>
    </div>
  )
}
