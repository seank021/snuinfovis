import MapDisplay from "./components/MapDisplay";

const App = () => {
  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      minHeight: "100vh"
    }}>
      <MapDisplay />
    </div>
  );
};

export default App;
