import * as d3 from "d3";
import { useRef, useEffect, useState } from "react";
import worldMap from "../assets/world.geo.json";

// Line datasets
import routesA from "../assets/datasets/od_world_A.geo.json";
import routesB from "../assets/datasets/od_world_B.geo.json";
import routesC from "../assets/datasets/od_world_C.geo.json";

type LineFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.LineString>;

const MapDisplay = () => {
  const [projectionType, setProjectionType] = useState<string>("mercator");
  const [datasetType, setDatasetType] = useState<string>("A");
  const [showIndicatrices, setShowIndicatrices] = useState(true);
  const [gridSpacing, setGridSpacing] = useState(30); // degrees
  const [baseRadius, setBaseRadius] = useState(3);    // px: visual size multiplier
  const svgRef = useRef<SVGSVGElement | null>(null);
  const width = 600;
  const height = 600;

  // --- Core: Tissot's indicatrix via local linearization ---
  const calculateTissotIndicatrix = (
    longitude: number,
    latitude: number,
    projection: d3.GeoProjection
  ) => {
    const deltaDegrees = 1e-3; // ~100 m at equator
    const degreesToRadians = Math.PI / 180;
    const latitudeRadians = latitude * degreesToRadians;
    const cosLatitude = Math.cos(latitudeRadians);

    // Avoid instability near poles
    if (!isFinite(cosLatitude) || Math.abs(cosLatitude) < 1e-3) return null;

    const center = projection([longitude, latitude]);
    if (!center) return null;

    // Neighboring points for finite differences
    const east = projection([longitude + deltaDegrees, latitude]);
    const west = projection([longitude - deltaDegrees, latitude]);
    const north = projection([longitude, latitude + deltaDegrees]);
    const south = projection([longitude, latitude - deltaDegrees]);

    // If both sides of a direction are clipped, skip
    if (!east && !west) return null;
    if (!north && !south) return null;

    // Finite differences (per degree)
    let dx_dlon: number, dy_dlon: number, dx_dlat: number, dy_dlat: number;

    // Anti-meridian seam guard (heuristic): avoid using central difference if x jumps too much
    const notAcrossSeam = (a: number[], b: number[]) => Math.abs(a[0] - b[0]) < 3000;

    // Longitude direction
    if (east && west && notAcrossSeam(east, west)) {
      dx_dlon = (east[0] - west[0]) / (2 * deltaDegrees);
      dy_dlon = (east[1] - west[1]) / (2 * deltaDegrees);
    } else if (east) {
      dx_dlon = (east[0] - center[0]) / deltaDegrees;
      dy_dlon = (east[1] - center[1]) / deltaDegrees;
    } else {
      dx_dlon = (center[0] - (west as number[])[0]) / deltaDegrees;
      dy_dlon = (center[1] - (west as number[])[1]) / deltaDegrees;
    }

    // Latitude direction
    if (north && south) {
      dx_dlat = (north[0] - south[0]) / (2 * deltaDegrees);
      dy_dlat = (north[1] - south[1]) / (2 * deltaDegrees);
    } else if (north) {
      dx_dlat = (north[0] - center[0]) / deltaDegrees;
      dy_dlat = (north[1] - center[1]) / deltaDegrees;
    } else {
      dx_dlat = (center[0] - (south as number[])[0]) / deltaDegrees;
      dy_dlat = (center[1] - (south as number[])[1]) / deltaDegrees;
    }

    // Build local mapping A from unit-length physical directions (east, north) to screen
    // The derivatives are currently per-degree. For Tissot's indicatrix, we need to account
    // for the fact that 1 degree of longitude = cos(latitude) smaller arc length at higher latitudes.
    // We divide the longitude derivatives by cos(latitude) to normalize for equal physical distances.
    const a11 = dx_dlon / cosLatitude;
    const a12 = dx_dlat;
    const a21 = dy_dlon / cosLatitude;
    const a22 = dy_dlat;

    // Symmetric metric matrix M = A * A^T
    const m11 = a11 * a11 + a12 * a12;
    const m12 = a11 * a21 + a12 * a22; // == m21
    const m22 = a21 * a21 + a22 * a22;

    const trace = m11 + m22;
    const determinant = m11 * m22 - m12 * m12;
    const discriminant = Math.max(0, (trace * trace) / 4 - determinant);

    const eigenValueMajor = trace / 2 + Math.sqrt(discriminant);
    const eigenValueMinor = trace / 2 - Math.sqrt(discriminant);

    if (!(eigenValueMajor > 0 && eigenValueMinor > 0) || !isFinite(eigenValueMajor + eigenValueMinor)) {
      return null;
    }

    // Axis scales (stretch factors). If projection is conformal, these are equal.
    const majorScale = Math.sqrt(eigenValueMajor);
    const minorScale = Math.sqrt(eigenValueMinor);

    // Debug: check if scales are reasonable
    if (!isFinite(majorScale) || !isFinite(minorScale) || majorScale > 10000 || minorScale > 10000) {
      return null;
    }

    // Orientation of major axis: eigenvector of M for eigenValueMajor
    let eigenVectorX = m12;
    let eigenVectorY = eigenValueMajor - m11;
    if (Math.abs(eigenVectorX) + Math.abs(eigenVectorY) < 1e-12) {
      eigenVectorX = eigenValueMajor - m22;
      eigenVectorY = m12;
    }
    const angleDegrees = (Math.atan2(eigenVectorY, eigenVectorX) * 180) / Math.PI;

    return {
      center,
      majorScale,
      minorScale,
      angle: angleDegrees
    };
  };

  useEffect(() => {
    if (!svgRef.current) return;

    const svg = d3.select(svgRef.current);
    const featureCollection: GeoJSON.FeatureCollection = worldMap as GeoJSON.FeatureCollection;

    // Choose projection
    let projection: d3.GeoProjection;
    switch (projectionType) {
      case "natural":
        projection = d3.geoNaturalEarth1();
        break;
      case "orthographic":
        projection = d3.geoOrthographic();
        break;
      case "equirectangular":
        projection = d3.geoEquirectangular();
        break;
      case "azimuthal":
        projection = d3.geoAzimuthalEqualArea();
        break;
      case "mercator":
      default:
        projection = d3.geoMercator();
    }

    projection.fitSize([width, height], featureCollection);
    const pathGenerator = d3.geoPath().projection(projection);

    svg.selectAll("*").remove();

    // Draw map
    svg
      .selectAll(".country")
      .data(featureCollection.features)
      .enter()
      .append("path")
      .attr("class", "country")
      .attr("d", (d) => pathGenerator(d)!)
      .attr("stroke", "black")
      .attr("fill", "#f0f0f0");

    // Choose dataset
    let selectedDataset: LineFeatureCollection;
    switch (datasetType) {
      case "B":
        selectedDataset = routesB as LineFeatureCollection;
        break;
      case "C":
        selectedDataset = routesC as LineFeatureCollection;
        break;
      case "A":
      default:
        selectedDataset = routesA as LineFeatureCollection;
    }

    // Draw routes
    const routesGroup = svg.append("g").attr("class", "routes");

    routesGroup
      .selectAll(".route")
      .data(selectedDataset.features)
      .enter()
      .append("path")
      .attr("class", "route")
      .attr("d", (d) => pathGenerator(d)!)
      .attr("fill", "none")
      .attr("stroke", (d) =>
        d.properties && (d.properties as any).selection === 1
          ? "#ff5722"
          : (d.properties as any).selection === 2
          ? "#4caf50"
          : "#1976d2"
      )
      .attr("stroke-width", (d) =>
        (d.properties as any).selection === 1 ? 2.5 : 1.5
      )
      .attr("stroke-opacity", 0.85);

    // ----- Tissot's indicatrices -----
    if (showIndicatrices) {
      const indicatrices: Array<{
        center: [number, number];
        majorScale: number;
        minorScale: number;
        angle: number;
        longitude: number;
        latitude: number;
      }> = [];

      // Grid of lat/lon points (avoid poles for stability)
      for (let latitude = -80; latitude <= 80; latitude += gridSpacing) {
        for (let longitude = -180; longitude < 180; longitude += gridSpacing) {
          const result = calculateTissotIndicatrix(longitude, latitude, projection);
          if (result) {
            indicatrices.push({
              ...result,
              longitude,
              latitude
            });
          }
        }
      }

      // Draw indicatrices
      svg
        .selectAll(".tissot")
        .data(indicatrices)
        .enter()
        .append("ellipse")
        .attr("class", "tissot")
        .attr("cx", (d) => d.center[0])
        .attr("cy", (d) => d.center[1])
        .attr("rx", (d) => baseRadius * d.majorScale)
        .attr("ry", (d) => baseRadius * d.minorScale)
        .attr("transform", (d) => `rotate(${d.angle}, ${d.center[0]}, ${d.center[1]})`)
        .attr("fill", "red")
        .attr("fill-opacity", 0.3)
        .attr("stroke", "red")
        .attr("stroke-width", 1)
        .attr("opacity", 0.6);
    }
  }, [projectionType, showIndicatrices, gridSpacing, baseRadius, datasetType]);

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ marginBottom: 8 }}>
        <label htmlFor="projection-select" style={{ marginRight: 8 }}>
          Projection:
        </label>
        <select
          id="projection-select"
          value={projectionType}
          onChange={(e) => setProjectionType(e.target.value)}
        >
          <option value="mercator">Mercator</option>
          <option value="natural">Natural Earth</option>
          <option value="orthographic">Orthographic</option>
          <option value="equirectangular">Equirectangular</option>
          <option value="azimuthal">Azimuthal Equal-Area</option>
        </select>
      </div>

      {/* Dataset dropdown */}
      <div style={{ marginBottom: 8 }}>
        <label style={{ marginRight: 8 }}>Dataset:</label>
        <select
          value={datasetType}
          onChange={(e) => setDatasetType(e.target.value)}
        >
          <option value="A">Air India Routes</option>
          <option value="B">Air Astana Routes</option>
          <option value="C">United Airlines Routes (Sampled)</option>
        </select>
      </div>

      {/* Tissot toggle */}
      <div style={{ marginBottom: 8 }}>
        <label htmlFor="tissot-toggle" style={{ marginRight: 8 }}>
          <input
            id="tissot-toggle"
            type="checkbox"
            checked={showIndicatrices}
            onChange={(e) => setShowIndicatrices(e.target.checked)}
            style={{ marginRight: 4 }}
          />
          Show Tissot&apos;s Indicatrices
        </label>
      </div>

      {/* Grid spacing slider */}
      <div style={{ marginBottom: 8 }}>
        <label htmlFor="grid-spacing" style={{ marginRight: 8 }}>
          Grid Spacing (degrees):
        </label>
        <input
          id="grid-spacing"
          type="range"
          min="15"
          max="60"
          step="15"
          value={gridSpacing}
          onChange={(e) => setGridSpacing(Number(e.target.value))}
          style={{ marginRight: 8 }}
        />
        <span>{gridSpacing}°</span>
      </div>

      {/* Base radius slider */}
      <div style={{ marginBottom: 8 }}>
        <label htmlFor="base-radius" style={{ marginRight: 8 }}>
          Indicatrix Base Radius (px):
        </label>
        <input
          id="base-radius"
          type="range"
          min="1"
          max="8"
          step="1"
          value={baseRadius}
          onChange={(e) => setBaseRadius(Number(e.target.value))}
          style={{ marginRight: 8 }}
        />
        <span>{baseRadius}px</span>
      </div>

      <div style={{ display: 'block' }}>
        <svg ref={svgRef} width={width} height={height} />
      </div>
    </div>
  );
};

export default MapDisplay;
