#version 430 core

struct Cell 
{
    // Match the ComputeCell structure from compute shaders
    vec4 positionAndRadius;  // x, y, z, radius
    vec4 velocityAndMass;    // vx, vy, vz, mass
    vec4 acceleration;       // ax, ay, az, unused
};

layout(std430, binding = 0) buffer CellBuffer {
    Cell cells[];
};

out vec4 fragColor;

uniform int u_cellCount;
uniform vec2 u_resolution;
uniform vec3 u_cameraPos;
uniform vec3 u_cameraFront;
uniform vec3 u_cameraRight;
uniform vec3 u_cameraUp;

const int MAX_ITERATIONS = 100;
const int MAX_DISTANCE = 100;
const float MIN_DISTANCE = 0.001;


float sphereSDF(vec3 point, vec3 center, float radius) {
    // Signed distance function for a sphere
    // Returns the distance from point p to the surface of the sphere
    // If the point is inside the sphere, it returns a negative value
    return length(point - center) - radius;
}

float sceneSDF(vec3 point) {
    float dist = 9999.0;
    // Iterate through all cells to find the minimum distance to any cell
    for (int i = 0; i < u_cellCount; ++i) {
        vec3 center = cells[i].positionAndRadius.xyz;
        float r = cells[i].positionAndRadius.w;
        dist = min(dist, sphereSDF(point, center, r)); // This can be changed to smooth min to make the cells blend together
    }
    return dist;
}

vec3 getNormal(vec3 point) {
    // Calculate the normal at a point by sampling the SDF in three directions
    float eps = 0.001;
    vec2 offset = vec2(eps, 0.0);
    vec3 n;
    n.x = sceneSDF(point + offset.xyy) - sceneSDF(point - offset.xyy);
    n.y = sceneSDF(point + offset.yxy) - sceneSDF(point - offset.yxy);
    n.z = sceneSDF(point + offset.yyx) - sceneSDF(point - offset.yyx);
    return normalize(n);
}

vec3 getRayDirection(vec2 uv) {
    // Convert screen coordinates to normalized device coordinates
    vec2 ndc = (uv / u_resolution) * 2.0 - 1.0;
    
    // Apply aspect ratio correction
    float aspectRatio = u_resolution.x / u_resolution.y;
    ndc.x *= aspectRatio;
    
    // Field of view (in radians) - smaller values = narrower FOV (less distortion)
    float fovRadians = radians(45.0); // 45 degree FOV
    float tanHalfFov = tan(fovRadians * 0.5);
    
    // Scale by FOV
    ndc *= tanHalfFov;
    
    // Create ray direction using camera basis vectors
    vec3 rayDir = normalize(u_cameraFront + u_cameraRight * ndc.x + u_cameraUp * ndc.y);
    return rayDir;
}

// This runs for every pixel
void main() {
    vec2 uv = gl_FragCoord.xy;
    vec3 camPos = u_cameraPos;
    vec3 rayDir = getRayDirection(uv);

    float t = 0.0; // This is the distance along the ray
    float dist; // Distance from the ray to the scene SDF
    float closestDist = 9999.0; // Initialize to a large value
    for (int i = 0; i < MAX_ITERATIONS; ++i) {
        vec3 point = camPos + rayDir * t; // Calculate the point along the ray
        dist = sceneSDF(point);
        if (dist < MIN_DISTANCE) { // If the distance is very small, we are close to the surface
            vec3 normal = getNormal(point);
            fragColor = vec4(normal * 0.5 + 0.5, 1.0); // Color based on normal
            //fragColor = vec4(1.0, 0.5, 0.5, 1.0);
            return;
        } else if (dist < closestDist) {
            closestDist = dist; // Update the closest distance found
        }
        t += dist;
        if (t > MAX_DISTANCE) break;
    }

    fragColor = vec4(1/(100*closestDist + 1.)); // Fallback color if no surface is hit. For now, just a gradient based on closest approach to the surface
}